require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))
Pod::Spec.new do |s|
  s.name = 'TransportMaps'
  s.version = package['version']
  s.summary = 'Customer-scoped Google mobile credentials'
  s.description = s.summary
  s.license = 'MIT'
  s.author = 'Navari'
  s.homepage = 'https://github.com/navariltd/vuna_transport_mobile'
  s.source = { :git => 'https://github.com/navariltd/vuna_transport_mobile.git' }
  s.platforms = { :ios => '17.0' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.source_files = '**/*.swift'
  s.dependency 'ExpoModulesCore'
  spm_dependency(s, url: 'https://github.com/googlemaps/ios-navigation-sdk.git', requirement: { kind: 'exactVersion', version: '11.3.0' }, products: ['GoogleNavigation'])
end
