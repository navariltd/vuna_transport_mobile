#!/usr/bin/env bash

# Build an ARM64 Android release APK for local device testing.
# Configure a production signing key before publishing through an app store.

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

if [[ ! -x "${android_dir}/gradlew" ]]; then
	echo "Android project is missing; generating it with Expo..."
	(cd "${mobile_dir}" && npx expo prebuild --platform android)
fi

export JAVA_HOME="${java_home}"
export ANDROID_HOME="${android_home}"
export ANDROID_SDK_ROOT="${android_home}"

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

./gradlew :app:assembleRelease --no-daemon --console=plain -PreactNativeArchitectures=arm64-v8a

if [[ ! -f "${apk_path}" ]]; then
	echo "Gradle completed without producing the expected APK: ${apk_path}" >&2
	exit 1
fi

echo
echo "Release APK built successfully:"
echo "${apk_path}"
stat -c 'Size: %s bytes' "${apk_path}"
