#!/usr/bin/env ruby

require 'fileutils'
require 'rexml/document'
require 'xcodeproj'

IOS_DIR = File.expand_path('../ios', __dir__)
PROJECT_PATH = File.join(IOS_DIR, 'FamilyOrganizer.xcodeproj')
SCHEME_PATH = File.join(PROJECT_PATH, 'xcshareddata', 'xcschemes', 'FamilyOrganizer.xcscheme')
APP_TARGET_NAME = 'FamilyOrganizer'
UI_TEST_TARGET_NAME = 'FamilyOrganizerUITests'
UI_TESTS_DIR = File.join(IOS_DIR, UI_TEST_TARGET_NAME)
UI_TESTS_SWIFT_PATH = File.join(UI_TESTS_DIR, "#{UI_TEST_TARGET_NAME}.swift")

def write_ui_test_file
  FileUtils.mkdir_p(UI_TESTS_DIR)

  content = <<~SWIFT
    import XCTest

    final class FamilyOrganizerUITests: XCTestCase {
      private var app: XCUIApplication!
      private var deviceAccessKey: String? {
        let value = ProcessInfo.processInfo.environment["UITEST_DEVICE_ACCESS_KEY"]?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (value?.isEmpty == false) ? value : nil
      }
      private var childPin: String { ProcessInfo.processInfo.environment["UITEST_CHILD_PIN"] ?? "5543" }
      private var parentPin: String { ProcessInfo.processInfo.environment["UITEST_PARENT_PIN"] ?? "1234" }

      override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments.append("--ui-testing")
        app.launch()
      }

      func testChildLoginAndSwitchUserFlow() throws {
        waitForLockScreen()

        app.buttons["member-card-judah"].tap()
        enterPin(childPin)
        app.buttons["member-confirm-button"].tap()

        XCTAssertTrue(app.buttons["chores-member-switcher"].waitForExistence(timeout: 15), "Expected chores screen")
        XCTAssertTrue(app.tabBars.buttons["tab-profile-menu"].waitForExistence(timeout: 5), "Expected profile menu tab")
        app.tabBars.buttons["tab-profile-menu"].tap()
        XCTAssertTrue(app.buttons["profile-menu-switch-user-button"].waitForExistence(timeout: 5), "Expected Switch User action")
        app.buttons["profile-menu-switch-user-button"].tap()

        XCTAssertTrue(app.buttons["member-card-judah"].waitForExistence(timeout: 10), "Expected lock screen after Switch User")
      }

      func testParentElevationAndLockFromMoreTab() throws {
        waitForLockScreen()

        app.buttons["member-card-david"].tap()
        enterPin(parentPin)
        app.buttons["member-confirm-button"].tap()

        XCTAssertTrue(app.buttons["chores-member-switcher"].waitForExistence(timeout: 15), "Expected chores screen after parent unlock")

        let moreTab = app.tabBars.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "More")).firstMatch
        XCTAssertTrue(moreTab.waitForExistence(timeout: 5), "Expected More tab")
        moreTab.tap()

        let lockButton = app.buttons["more-lock-app-button"]
        XCTAssertTrue(lockButton.waitForExistence(timeout: 10), "Expected Lock App button in More tab")
        lockButton.tap()

        XCTAssertTrue(app.buttons["member-card-david"].waitForExistence(timeout: 10), "Expected lock screen after Lock App")
      }

      private func waitForLockScreen() {
        ensureActivatedIfNeeded()
        let header = app.staticTexts["Who’s using the app?"]
        XCTAssertTrue(header.waitForExistence(timeout: 20), "Expected lock screen header")
        XCTAssertTrue(app.buttons["member-card-judah"].waitForExistence(timeout: 10), "Expected family member cards")
      }

      private func ensureActivatedIfNeeded() {
        let activationTitle = app.staticTexts["Activate this iPhone"]
        guard activationTitle.waitForExistence(timeout: 2) else { return }

        guard let key = deviceAccessKey else {
          XCTFail("App is on activation screen but UITEST_DEVICE_ACCESS_KEY was not provided")
          return
        }

        let keyInput = app.textFields["activation-key-input"]
        XCTAssertTrue(keyInput.waitForExistence(timeout: 10), "Expected activation key input")
        keyInput.tap()
        keyInput.typeText(key)

        let activateButton = app.buttons["activate-device-button"]
        XCTAssertTrue(activateButton.waitForExistence(timeout: 5), "Expected activate button")
        activateButton.tap()
      }

      private func enterPin(_ pin: String) {
        let secure = app.secureTextFields["member-pin-input"]
        let text = app.textFields["member-pin-input"]
        let field = secure.waitForExistence(timeout: 10) ? secure : text
        XCTAssertTrue(field.exists, "Expected PIN input")
        field.tap()
        field.typeText(pin)
      }
    }
  SWIFT

  File.write(UI_TESTS_SWIFT_PATH, content)
end

def buildable_ref_attributes(target)
  {
    'BuildableIdentifier' => 'primary',
    'BlueprintIdentifier' => target.uuid,
    'BuildableName' => target.product_reference.path,
    'BlueprintName' => target.name,
    'ReferencedContainer' => 'container:FamilyOrganizer.xcodeproj'
  }
end

def add_buildable_reference(parent, target)
  el = REXML::Element.new('BuildableReference')
  buildable_ref_attributes(target).each { |k, v| el.attributes[k] = v }
  parent.add_element(el)
  el
end

def ensure_build_action_entry(scheme_doc, ui_target)
  build_action_entries = REXML::XPath.first(scheme_doc, '/Scheme/BuildAction/BuildActionEntries')
  existing = REXML::XPath.match(build_action_entries, 'BuildActionEntry').find do |entry|
    ref = entry.elements['BuildableReference']
    ref && ref.attributes['BlueprintIdentifier'] == ui_target.uuid
  end
  return if existing

  entry = REXML::Element.new('BuildActionEntry')
  {
    'buildForTesting' => 'YES',
    'buildForRunning' => 'NO',
    'buildForProfiling' => 'NO',
    'buildForArchiving' => 'NO',
    'buildForAnalyzing' => 'YES'
  }.each { |k, v| entry.attributes[k] = v }
  add_buildable_reference(entry, ui_target)
  build_action_entries.add_element(entry)
end

def patch_test_action(scheme_doc, app_target, ui_target, valid_target_uuids)
  test_action = REXML::XPath.first(scheme_doc, '/Scheme/TestAction')
  testables = test_action.elements['Testables'] || test_action.add_element('Testables')

  REXML::XPath.match(testables, 'TestableReference').each do |test_ref|
    buildable = test_ref.elements['BuildableReference']
    next unless buildable
    blueprint_id = buildable.attributes['BlueprintIdentifier']
    unless valid_target_uuids.include?(blueprint_id) && blueprint_id == ui_target.uuid
      testables.delete_element(test_ref)
    end
  end

  existing_ui = REXML::XPath.match(testables, 'TestableReference').find do |test_ref|
    buildable = test_ref.elements['BuildableReference']
    buildable && buildable.attributes['BlueprintIdentifier'] == ui_target.uuid
  end

  unless existing_ui
    test_ref = REXML::Element.new('TestableReference')
    test_ref.attributes['skipped'] = 'NO'
    add_buildable_reference(test_ref, ui_target)
    testables.add_element(test_ref)
  end

  macro = test_action.elements['MacroExpansion']
  if macro
    macro.elements.each('BuildableReference') { |child| macro.delete_element(child) }
  else
    macro = test_action.add_element('MacroExpansion')
  end
  add_buildable_reference(macro, app_target)
end

def save_scheme(scheme_doc)
  File.open(SCHEME_PATH, 'w') do |f|
    formatter = REXML::Formatters::Pretty.new(2)
    formatter.compact = true
    formatter.write(scheme_doc, f)
    f.write("\n")
  end
end

def ensure_ui_test_target(project)
  app_target = project.targets.find { |t| t.name == APP_TARGET_NAME }
  raise "Could not find app target #{APP_TARGET_NAME}" unless app_target

  ui_target = project.targets.find { |t| t.name == UI_TEST_TARGET_NAME }
  created = false

  unless ui_target
    deployment_target = app_target.build_configurations.first.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] || '15.1'
    ui_target = project.new_target(:ui_test_bundle, UI_TEST_TARGET_NAME, :ios, deployment_target)
    created = true
  end

  ui_target.add_dependency(app_target) unless ui_target.dependencies.any? { |d| d.target == app_target }

  ui_group = project.main_group.find_subpath(UI_TEST_TARGET_NAME, true)
  ui_group.set_source_tree('SOURCE_ROOT')

  file_ref = ui_group.files.find { |f| f.path == "#{UI_TEST_TARGET_NAME}/#{UI_TEST_TARGET_NAME}.swift" } ||
             ui_group.new_file("#{UI_TEST_TARGET_NAME}/#{UI_TEST_TARGET_NAME}.swift")
  unless ui_target.source_build_phase.files_references.include?(file_ref)
    ui_target.source_build_phase.add_file_reference(file_ref, true)
  end

  # Ensure XCTest is linked (new_target usually adds it, but keep this idempotent).
  unless ui_target.frameworks_build_phase.files_references.any? { |f| f&.path == 'XCTest.framework' }
    frameworks_group = project.frameworks_group || project.main_group['Frameworks'] || project.main_group.new_group('Frameworks')
    xctest_ref = frameworks_group.files.find { |f| f.path == 'System/Library/Frameworks/XCTest.framework' } ||
                 frameworks_group.new_file('System/Library/Frameworks/XCTest.framework')
    ui_target.frameworks_build_phase.add_file_reference(xctest_ref, true)
  end

  app_settings_by_config = app_target.build_configurations.each_with_object({}) do |config, acc|
    acc[config.name] = config.build_settings
  end

  ui_target.build_configurations.each do |config|
    app_settings = app_settings_by_config[config.name] || app_settings_by_config.values.first || {}
    bundle_id = app_settings['PRODUCT_BUNDLE_IDENTIFIER'] || 'com.familyorganizer.app'

    config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = "#{bundle_id}.uitests"
    config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
    config.build_settings['SWIFT_VERSION'] = app_settings['SWIFT_VERSION'] || '5.0'
    config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = app_settings['IPHONEOS_DEPLOYMENT_TARGET'] || '15.1'
    config.build_settings['TARGETED_DEVICE_FAMILY'] = app_settings['TARGETED_DEVICE_FAMILY'] || '1,2'
    config.build_settings['TEST_TARGET_NAME'] = APP_TARGET_NAME
    config.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
    config.build_settings['CODE_SIGN_STYLE'] = app_settings['CODE_SIGN_STYLE'] if app_settings['CODE_SIGN_STYLE']
    config.build_settings['DEVELOPMENT_TEAM'] = app_settings['DEVELOPMENT_TEAM'] if app_settings['DEVELOPMENT_TEAM']
    config.build_settings['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'NO'
    config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@loader_path/Frameworks']
  end

  [project, app_target, ui_target, created]
end

def patch_scheme(project, app_target, ui_target)
  xml = File.read(SCHEME_PATH)
  scheme_doc = REXML::Document.new(xml)
  valid_target_uuids = project.targets.map(&:uuid)
  ensure_build_action_entry(scheme_doc, ui_target)
  patch_test_action(scheme_doc, app_target, ui_target, valid_target_uuids)
  save_scheme(scheme_doc)
end

abort("Missing Xcode project at #{PROJECT_PATH}") unless File.exist?(PROJECT_PATH)
abort("Missing shared scheme at #{SCHEME_PATH}") unless File.exist?(SCHEME_PATH)

write_ui_test_file

project, app_target, ui_target, created = ensure_ui_test_target(Xcodeproj::Project.open(PROJECT_PATH))
project.save
patch_scheme(project, app_target, ui_target)

puts "#{created ? 'Created' : 'Updated'} #{UI_TEST_TARGET_NAME} in #{PROJECT_PATH}"
puts "Patched scheme: #{SCHEME_PATH}"
puts "UI tests file: #{UI_TESTS_SWIFT_PATH}"
