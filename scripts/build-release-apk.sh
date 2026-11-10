#!/usr/bin/env bash

# Build an ARM64 APK with the same signing identity used for app updates.
# Set VUNA_TRANSPORT_RELEASE_STORE_FILE, VUNA_TRANSPORT_RELEASE_STORE_PASSWORD,
# VUNA_TRANSPORT_RELEASE_KEY_ALIAS and VUNA_TRANSPORT_RELEASE_KEY_PASSWORD.

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mobile_dir="$(cd -- "${script_dir}/.." && pwd)"
android_dir="${mobile_dir}/android"
apk_path="${android_dir}/app/build/outputs/apk/release/app-release.apk"

clean_build=false
if [[ "${1:-}" == "--clean" ]]; then
	clean_build=true
elif [[ $# -gt 0 ]]; then
	echo "Usage: $(basename "$0") [--clean]" >&2
	exit 2
fi

for signing_variable in VUNA_TRANSPORT_RELEASE_STORE_FILE VUNA_TRANSPORT_RELEASE_STORE_PASSWORD VUNA_TRANSPORT_RELEASE_KEY_ALIAS VUNA_TRANSPORT_RELEASE_KEY_PASSWORD; do
	if [[ -z "${!signing_variable:-}" ]]; then
		echo "Missing ${signing_variable}. Release builds require your production signing key." >&2
		echo "For a debug-signed development build, use: npx expo run:android" >&2
		exit 1
	fi
done
if [[ ! -f "${VUNA_TRANSPORT_RELEASE_STORE_FILE}" ]]; then
	echo "The release keystore does not exist: ${VUNA_TRANSPORT_RELEASE_STORE_FILE}" >&2
	exit 1
fi
export VUNA_TRANSPORT_RELEASE_STORE_FILE="$(realpath "${VUNA_TRANSPORT_RELEASE_STORE_FILE}")"

release_name="${VUNA_TRANSPORT_VERSION_NAME:-$(node -p "require('${mobile_dir}/app.json').expo.version")}"
release_metadata="$(node "${script_dir}/release-version.mjs" "${release_name}")"
release_code="$(printf '%s\n' "${release_metadata}" | sed -n 's/^code=//p')"
if [[ -n "${VUNA_TRANSPORT_VERSION_CODE:-}" && "${VUNA_TRANSPORT_VERSION_CODE}" != "${release_code}" ]]; then
	echo "VUNA_TRANSPORT_VERSION_CODE does not match semantic version ${release_name}." >&2
	exit 1
fi

resolve_java_home() {
	if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
		echo "${JAVA_HOME}"
		return
	fi

	for candidate in \
		"/usr/lib/jvm/java-17-openjdk-amd64" \
		"/usr/lib/jvm/java-17-openjdk"; do
		if [[ -x "${candidate}/bin/java" ]]; then
			echo "${candidate}"
			return
		fi
	done
}

resolve_android_home() {
	if [[ -n "${ANDROID_HOME:-}" && -d "${ANDROID_HOME}" ]]; then
		echo "${ANDROID_HOME}"
		return
	fi

	if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "${ANDROID_SDK_ROOT}" ]]; then
		echo "${ANDROID_SDK_ROOT}"
		return
	fi

	if [[ -f "${android_dir}/local.properties" ]]; then
		local configured_sdk
		configured_sdk="$(sed -n 's/^sdk\.dir=//p' "${android_dir}/local.properties" | head -n 1 | sed 's#\\\\#/#g')"
		if [[ -n "${configured_sdk}" && -d "${configured_sdk}" ]]; then
			echo "${configured_sdk}"
			return
		fi
	fi

	if [[ -n "${HOME:-}" && -d "${HOME}/Android/Sdk" ]]; then
		echo "${HOME}/Android/Sdk"
	fi
}

java_home="$(resolve_java_home || true)"
if [[ -z "${java_home}" ]]; then
	echo "Java 17 was not found. Install it or set JAVA_HOME to a Java 17 installation." >&2
	exit 1
fi

java_version="$(${java_home}/bin/java -version 2>&1 | head -n 1)"
if [[ ! "${java_version}" =~ \"17\. ]]; then
	echo "Java 17 is required, but found: ${java_version}" >&2
	exit 1
fi

android_home="$(resolve_android_home || true)"
if [[ -z "${android_home}" ]]; then
	echo "Android SDK was not found." >&2
	echo "Set ANDROID_HOME or add sdk.dir to android/local.properties." >&2
	exit 1
fi

if [[ ! -d "${mobile_dir}/node_modules" ]]; then
	echo "Mobile dependencies are missing. Run: npm ci" >&2
	exit 1
fi

export JAVA_HOME="${java_home}"
export ANDROID_HOME="${android_home}"
export ANDROID_SDK_ROOT="${android_home}"

# Keep the package ID, plugins and permissions in sync with app.json, including
# when reusing an existing generated Android project on a developer's machine.
echo "Preparing Android project from the current Expo configuration..."
(cd "${mobile_dir}" && npx expo prebuild --platform android --no-install)
node "${script_dir}/prepare-android-release.mjs" "${android_dir}/app/build.gradle"

cd "${android_dir}"

echo "Using Java: $(${JAVA_HOME}/bin/java -version 2>&1 | head -n 1)"
echo "Using Android SDK: ${ANDROID_HOME}"
echo "Building ARM64 release APK..."

if [[ "${clean_build}" == true ]]; then
	# Remove only generated Android artifacts before rebuilding.
	echo "Removing generated Android build artifacts..."
	rm -rf \
		"${android_dir}/.cxx" \
		"${android_dir}/app/.cxx" \
		"${android_dir}/build" \
		"${android_dir}/app/build"
fi

./gradlew :app:assembleRelease --no-daemon --console=plain \
	-PreactNativeArchitectures=arm64-v8a \
	-PVUNA_TRANSPORT_VERSION_NAME="${release_name#v}" \
	-PVUNA_TRANSPORT_VERSION_CODE="${release_code}"

if [[ ! -f "${apk_path}" ]]; then
	echo "Gradle completed without producing the expected APK: ${apk_path}" >&2
	exit 1
fi

echo
echo "Release APK built successfully:"
echo "${apk_path}"
stat -c 'Size: %s bytes' "${apk_path}"
