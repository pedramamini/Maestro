/**
 * iOS Tools - XCUITest Project Management
 *
 * Manages the XCUITest inspector project lifecycle:
 * - Creating temporary Xcode projects with the inspector target
 * - Building the test bundle for simulators
 * - Running the inspector and capturing output
 * - Cleaning up temporary files
 *
 * The inspector uses Swift files from xcuitest-runner/ to traverse
 * the XCUIElement tree and emit structured JSON output.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { IOSResult } from './types';
import { runXcodebuild, parseXcodebuildOutput } from './utils';
import { execFileNoThrow } from '../utils/execFile';
import { logger } from '../utils/logger';
import { ElementNode, AccessibilityWarning, OUTPUT_START_MARKER, OUTPUT_END_MARKER } from './inspect';
import * as os from 'os';

const LOG_CONTEXT = '[iOS-XCUITest-Project]';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for creating an inspector project
 */
export interface CreateProjectOptions {
  /** Output directory for the project (defaults to temp) */
  outputDir?: string;
  /** Project name (defaults to MaestroInspector) */
  projectName?: string;
  /** Bundle identifier prefix (defaults to com.maestro.inspector) */
  bundleIdPrefix?: string;
}

/**
 * Result of project creation
 */
export interface CreateProjectResult {
  /** Path to the created project directory */
  projectPath: string;
  /** Path to the .xcodeproj file */
  xcodeprojPath: string;
  /** Name of the UI test target */
  testTargetName: string;
  /** Bundle identifier of the test target */
  bundleId: string;
}

/**
 * Options for building the inspector
 */
export interface BuildInspectorOptions {
  /** Path to the project directory */
  projectPath: string;
  /** Simulator destination (UDID or destination string) */
  destination: string;
  /** Derived data path override */
  derivedDataPath?: string;
  /** Build configuration (default: Debug) */
  configuration?: 'Debug' | 'Release';
}

/**
 * Result of building the inspector
 */
export interface BuildInspectorResult {
  /** Path to the built xctest bundle */
  bundlePath: string;
  /** Path to the derived data */
  derivedDataPath: string;
  /** Build duration in seconds */
  duration: number;
  /** Any build warnings */
  warnings: string[];
}

/**
 * Options for running the inspector
 */
export interface RunInspectorOptions {
  /** Path to the built xctest bundle */
  bundlePath: string;
  /** Bundle ID of the app to inspect */
  appBundleId: string;
  /** Simulator UDID */
  simulatorUdid: string;
  /** Path to project for test-without-building */
  projectPath?: string;
  /** Maximum depth to traverse (default: unlimited) */
  maxDepth?: number;
  /** Include hidden elements (default: false) */
  includeHidden?: boolean;
  /** Include frame data (default: true) */
  includeFrames?: boolean;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
}

/**
 * Result from running the inspector
 */
export interface RunInspectorResult {
  /** Whether the inspection succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** App bundle ID */
  bundleId: string;
  /** Root element of the UI tree */
  rootElement?: ElementNode;
  /** Statistics about the UI */
  stats?: {
    totalElements: number;
    interactableElements: number;
    identifiedElements: number;
    labeledElements: number;
    buttons: number;
    textFields: number;
    textElements: number;
    images: number;
    scrollViews: number;
    tables: number;
    alerts: number;
    warnings: AccessibilityWarning[];
  };
  /** Timestamp of inspection */
  timestamp: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Default cache directory for built inspector bundles */
const CACHE_DIR = path.join(os.homedir(), '.maestro', 'ios-tools', 'xcuitest-cache');

/** Path to Swift source files for the inspector */
const SWIFT_SOURCE_DIR = path.join(__dirname, 'xcuitest-runner');

// =============================================================================
// Project Creation
// =============================================================================

/**
 * Create a temporary Xcode project for the UI inspector.
 *
 * This generates a minimal project with:
 * - A host app target (required for UI tests)
 * - A UI test target containing the inspector Swift files
 *
 * @param options - Project creation options
 * @returns Created project paths and metadata
 */
export async function createInspectorProject(
  options: CreateProjectOptions = {}
): Promise<IOSResult<CreateProjectResult>> {
  const {
    outputDir = path.join(os.tmpdir(), `maestro-inspector-${Date.now()}`),
    projectName = 'MaestroInspector',
    bundleIdPrefix = 'com.maestro.inspector',
  } = options;

  logger.info(`${LOG_CONTEXT} Creating inspector project at ${outputDir}`, LOG_CONTEXT);

  try {
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    const projectDir = path.join(outputDir, projectName);
    await fs.mkdir(projectDir, { recursive: true });

    const xcodeprojPath = path.join(projectDir, `${projectName}.xcodeproj`);
    const testTargetName = `${projectName}UITests`;
    const bundleId = `${bundleIdPrefix}.${projectName.toLowerCase()}`;
    const testBundleId = `${bundleId}.uitests`;

    // Create project structure
    await fs.mkdir(xcodeprojPath, { recursive: true });
    await fs.mkdir(path.join(projectDir, projectName), { recursive: true });
    await fs.mkdir(path.join(projectDir, testTargetName), { recursive: true });

    // Copy Swift source files to the test target
    await copySwiftSources(path.join(projectDir, testTargetName));

    // Create the test runner file
    await createTestRunnerFile(path.join(projectDir, testTargetName), testTargetName);

    // Create Info.plist for host app
    await createInfoPlist(path.join(projectDir, projectName), bundleId);

    // Create Info.plist for test target
    await createInfoPlist(path.join(projectDir, testTargetName), testBundleId);

    // Create minimal host app files
    await createHostAppFiles(path.join(projectDir, projectName), projectName);

    // Create project.pbxproj
    await createProjectFile(xcodeprojPath, projectName, testTargetName, bundleId, testBundleId);

    logger.info(`${LOG_CONTEXT} Created inspector project: ${xcodeprojPath}`, LOG_CONTEXT);

    return {
      success: true,
      data: {
        projectPath: projectDir,
        xcodeprojPath,
        testTargetName,
        bundleId: testBundleId,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`${LOG_CONTEXT} Failed to create inspector project: ${message}`, LOG_CONTEXT);
    return {
      success: false,
      error: `Failed to create inspector project: ${message}`,
      errorCode: 'COMMAND_FAILED',
    };
  }
}

/**
 * Copy Swift source files to the test target directory
 */
async function copySwiftSources(targetDir: string): Promise<void> {
  const sourceFiles = ['ElementNode.swift', 'UIInspector.swift', 'InspectorOutput.swift'];

  for (const file of sourceFiles) {
    const sourcePath = path.join(SWIFT_SOURCE_DIR, file);
    const destPath = path.join(targetDir, file);

    if (existsSync(sourcePath)) {
      const content = await fs.readFile(sourcePath, 'utf-8');
      await fs.writeFile(destPath, content);
      logger.debug(`${LOG_CONTEXT} Copied ${file}`, LOG_CONTEXT);
    } else {
      logger.warn(`${LOG_CONTEXT} Source file not found: ${sourcePath}`, LOG_CONTEXT);
    }
  }
}

/**
 * Create the test runner file that executes the inspection
 */
async function createTestRunnerFile(targetDir: string, targetName: string): Promise<void> {
  const content = `import XCTest

/// Main test runner for UI inspection.
/// This test is executed via xcodebuild and outputs JSON to stdout.
class ${targetName}: XCTestCase {

    /// Environment variable keys for configuration
    private enum EnvKeys {
        static let bundleId = "MAESTRO_TARGET_BUNDLE_ID"
        static let maxDepth = "MAESTRO_MAX_DEPTH"
        static let includeHidden = "MAESTRO_INCLUDE_HIDDEN"
        static let includeFrames = "MAESTRO_INCLUDE_FRAMES"
        static let outputPath = "MAESTRO_OUTPUT_PATH"
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = true
    }

    /// Run UI inspection on the target app
    func testInspectUI() throws {
        // Get target bundle ID from environment
        guard let bundleId = ProcessInfo.processInfo.environment[EnvKeys.bundleId] else {
            InspectorOutputWriter.writeError("MAESTRO_TARGET_BUNDLE_ID environment variable not set")
            return
        }

        // Parse configuration from environment
        let maxDepth: Int?
        if let depthStr = ProcessInfo.processInfo.environment[EnvKeys.maxDepth],
           let depth = Int(depthStr) {
            maxDepth = depth
        } else {
            maxDepth = nil
        }

        let includeHidden = ProcessInfo.processInfo.environment[EnvKeys.includeHidden] == "true"
        let includeFrames = ProcessInfo.processInfo.environment[EnvKeys.includeFrames] != "false"

        // Create and launch the target application
        let app = XCUIApplication(bundleIdentifier: bundleId)

        // Check if app is already running
        if app.state != .runningForeground {
            app.activate()
            // Wait briefly for app to come to foreground
            sleep(1)
        }

        // Configure inspector options
        var options = UIInspector.Options.default
        options.maxDepth = maxDepth
        options.includeHidden = includeHidden
        options.includeFrames = includeFrames

        // Run inspection
        let inspector = UIInspector(app: app, options: options)
        let result = inspector.inspect()

        // Output result
        if let outputPath = ProcessInfo.processInfo.environment[EnvKeys.outputPath] {
            InspectorOutputWriter.writeToFile(result, path: outputPath)
        } else {
            InspectorOutputWriter.writeToStdout(result)
        }
    }
}
`;

  await fs.writeFile(path.join(targetDir, `${targetName}.swift`), content);
}

/**
 * Create Info.plist file
 */
async function createInfoPlist(targetDir: string, bundleId: string): Promise<void> {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>${bundleId}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
</dict>
</plist>
`;

  await fs.writeFile(path.join(targetDir, 'Info.plist'), content);
}

/**
 * Create minimal host app files
 */
async function createHostAppFiles(appDir: string, projectName: string): Promise<void> {
  // AppDelegate.swift
  const appDelegateContent = `import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = UIViewController()
        window?.makeKeyAndVisible()
        return true
    }
}
`;

  await fs.writeFile(path.join(appDir, 'AppDelegate.swift'), appDelegateContent);

  // Assets.xcassets
  const assetsDir = path.join(appDir, 'Assets.xcassets');
  await fs.mkdir(assetsDir, { recursive: true });

  const contentsJson = `{
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}`;
  await fs.writeFile(path.join(assetsDir, 'Contents.json'), contentsJson);

  // Empty launch storyboard is not strictly needed for iOS 13+
  logger.debug(`${LOG_CONTEXT} Created host app files for ${projectName}`, LOG_CONTEXT);
}

/**
 * Create the Xcode project file (project.pbxproj)
 */
async function createProjectFile(
  xcodeprojPath: string,
  projectName: string,
  testTargetName: string,
  appBundleId: string,
  testBundleId: string
): Promise<void> {
  // Generate unique IDs for project references
  const ids = generateProjectIds(projectName, testTargetName);

  const pbxprojContent = generatePbxprojContent(projectName, testTargetName, appBundleId, testBundleId, ids);

  await fs.writeFile(path.join(xcodeprojPath, 'project.pbxproj'), pbxprojContent);
  logger.debug(`${LOG_CONTEXT} Created project.pbxproj`, LOG_CONTEXT);
}

/**
 * Generate unique IDs for project file references
 */
function generateProjectIds(projectName: string, testTargetName: string): Record<string, string> {
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(16).toUpperCase().padStart(24, '0').slice(0, 24);
  };

  return {
    project: hash(`${projectName}_project`),
    mainGroup: hash(`${projectName}_mainGroup`),
    appGroup: hash(`${projectName}_appGroup`),
    testGroup: hash(`${testTargetName}_testGroup`),
    productsGroup: hash(`${projectName}_products`),
    appTarget: hash(`${projectName}_appTarget`),
    testTarget: hash(`${testTargetName}_testTarget`),
    appProduct: hash(`${projectName}_app`),
    testProduct: hash(`${testTargetName}_xctest`),
    appBuildConfig: hash(`${projectName}_appBuildConfig`),
    testBuildConfig: hash(`${testTargetName}_testBuildConfig`),
    projectBuildConfig: hash(`${projectName}_projectBuildConfig`),
    appConfigList: hash(`${projectName}_appConfigList`),
    testConfigList: hash(`${testTargetName}_testConfigList`),
    projectConfigList: hash(`${projectName}_projectConfigList`),
    appSourcesBuildPhase: hash(`${projectName}_appSources`),
    testSourcesBuildPhase: hash(`${testTargetName}_testSources`),
    appFrameworksBuildPhase: hash(`${projectName}_frameworks`),
    testFrameworksBuildPhase: hash(`${testTargetName}_frameworks`),
    // Swift source file refs
    appDelegateRef: hash('AppDelegate.swift_ref'),
    appDelegateBuild: hash('AppDelegate.swift_build'),
    elementNodeRef: hash('ElementNode.swift_ref'),
    elementNodeBuild: hash('ElementNode.swift_build'),
    uiInspectorRef: hash('UIInspector.swift_ref'),
    uiInspectorBuild: hash('UIInspector.swift_build'),
    inspectorOutputRef: hash('InspectorOutput.swift_ref'),
    inspectorOutputBuild: hash('InspectorOutput.swift_build'),
    testRunnerRef: hash(`${testTargetName}.swift_ref`),
    testRunnerBuild: hash(`${testTargetName}.swift_build`),
    infoPlistAppRef: hash('Info.plist_app_ref'),
    infoPlistTestRef: hash('Info.plist_test_ref'),
    assetsRef: hash('Assets.xcassets_ref'),
    containerItemProxy: hash('containerItemProxy'),
    targetDependency: hash('targetDependency'),
  };
}

/**
 * Generate the full project.pbxproj content
 */
function generatePbxprojContent(
  projectName: string,
  testTargetName: string,
  appBundleId: string,
  testBundleId: string,
  ids: Record<string, string>
): string {
  return `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 56;
	objects = {

/* Begin PBXBuildFile section */
		${ids.appDelegateBuild} /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ids.appDelegateRef} /* AppDelegate.swift */; };
		${ids.elementNodeBuild} /* ElementNode.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ids.elementNodeRef} /* ElementNode.swift */; };
		${ids.uiInspectorBuild} /* UIInspector.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ids.uiInspectorRef} /* UIInspector.swift */; };
		${ids.inspectorOutputBuild} /* InspectorOutput.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ids.inspectorOutputRef} /* InspectorOutput.swift */; };
		${ids.testRunnerBuild} /* ${testTargetName}.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ids.testRunnerRef} /* ${testTargetName}.swift */; };
/* End PBXBuildFile section */

/* Begin PBXContainerItemProxy section */
		${ids.containerItemProxy} /* PBXContainerItemProxy */ = {
			isa = PBXContainerItemProxy;
			containerPortal = ${ids.project} /* Project object */;
			proxyType = 1;
			remoteGlobalIDString = ${ids.appTarget};
			remoteInfo = ${projectName};
		};
/* End PBXContainerItemProxy section */

/* Begin PBXFileReference section */
		${ids.appProduct} /* ${projectName}.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = "${projectName}.app"; sourceTree = BUILT_PRODUCTS_DIR; };
		${ids.testProduct} /* ${testTargetName}.xctest */ = {isa = PBXFileReference; explicitFileType = wrapper.cfbundle; includeInIndex = 0; path = "${testTargetName}.xctest"; sourceTree = BUILT_PRODUCTS_DIR; };
		${ids.appDelegateRef} /* AppDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppDelegate.swift; sourceTree = "<group>"; };
		${ids.elementNodeRef} /* ElementNode.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ElementNode.swift; sourceTree = "<group>"; };
		${ids.uiInspectorRef} /* UIInspector.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = UIInspector.swift; sourceTree = "<group>"; };
		${ids.inspectorOutputRef} /* InspectorOutput.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = InspectorOutput.swift; sourceTree = "<group>"; };
		${ids.testRunnerRef} /* ${testTargetName}.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = "${testTargetName}.swift"; sourceTree = "<group>"; };
		${ids.infoPlistAppRef} /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
		${ids.infoPlistTestRef} /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
		${ids.assetsRef} /* Assets.xcassets */ = {isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; };
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
		${ids.appFrameworksBuildPhase} /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
		${ids.testFrameworksBuildPhase} /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
		${ids.mainGroup} = {
			isa = PBXGroup;
			children = (
				${ids.appGroup} /* ${projectName} */,
				${ids.testGroup} /* ${testTargetName} */,
				${ids.productsGroup} /* Products */,
			);
			sourceTree = "<group>";
		};
		${ids.appGroup} /* ${projectName} */ = {
			isa = PBXGroup;
			children = (
				${ids.appDelegateRef} /* AppDelegate.swift */,
				${ids.assetsRef} /* Assets.xcassets */,
				${ids.infoPlistAppRef} /* Info.plist */,
			);
			path = "${projectName}";
			sourceTree = "<group>";
		};
		${ids.testGroup} /* ${testTargetName} */ = {
			isa = PBXGroup;
			children = (
				${ids.testRunnerRef} /* ${testTargetName}.swift */,
				${ids.elementNodeRef} /* ElementNode.swift */,
				${ids.uiInspectorRef} /* UIInspector.swift */,
				${ids.inspectorOutputRef} /* InspectorOutput.swift */,
				${ids.infoPlistTestRef} /* Info.plist */,
			);
			path = "${testTargetName}";
			sourceTree = "<group>";
		};
		${ids.productsGroup} /* Products */ = {
			isa = PBXGroup;
			children = (
				${ids.appProduct} /* ${projectName}.app */,
				${ids.testProduct} /* ${testTargetName}.xctest */,
			);
			name = Products;
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		${ids.appTarget} /* ${projectName} */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = ${ids.appConfigList} /* Build configuration list for PBXNativeTarget "${projectName}" */;
			buildPhases = (
				${ids.appSourcesBuildPhase} /* Sources */,
				${ids.appFrameworksBuildPhase} /* Frameworks */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = "${projectName}";
			productName = "${projectName}";
			productReference = ${ids.appProduct} /* ${projectName}.app */;
			productType = "com.apple.product-type.application";
		};
		${ids.testTarget} /* ${testTargetName} */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = ${ids.testConfigList} /* Build configuration list for PBXNativeTarget "${testTargetName}" */;
			buildPhases = (
				${ids.testSourcesBuildPhase} /* Sources */,
				${ids.testFrameworksBuildPhase} /* Frameworks */,
			);
			buildRules = (
			);
			dependencies = (
				${ids.targetDependency} /* PBXTargetDependency */,
			);
			name = "${testTargetName}";
			productName = "${testTargetName}";
			productReference = ${ids.testProduct} /* ${testTargetName}.xctest */;
			productType = "com.apple.product-type.bundle.ui-testing";
		};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		${ids.project} /* Project object */ = {
			isa = PBXProject;
			attributes = {
				BuildIndependentTargetsInParallel = 1;
				LastSwiftUpdateCheck = 1500;
				LastUpgradeCheck = 1500;
			};
			buildConfigurationList = ${ids.projectConfigList} /* Build configuration list for PBXProject "${projectName}" */;
			compatibilityVersion = "Xcode 14.0";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
				Base,
			);
			mainGroup = ${ids.mainGroup};
			productRefGroup = ${ids.productsGroup} /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				${ids.appTarget} /* ${projectName} */,
				${ids.testTarget} /* ${testTargetName} */,
			);
		};
/* End PBXProject section */

/* Begin PBXSourcesBuildPhase section */
		${ids.appSourcesBuildPhase} /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				${ids.appDelegateBuild} /* AppDelegate.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
		${ids.testSourcesBuildPhase} /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				${ids.testRunnerBuild} /* ${testTargetName}.swift in Sources */,
				${ids.elementNodeBuild} /* ElementNode.swift in Sources */,
				${ids.uiInspectorBuild} /* UIInspector.swift in Sources */,
				${ids.inspectorOutputBuild} /* InspectorOutput.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXSourcesBuildPhase section */

/* Begin PBXTargetDependency section */
		${ids.targetDependency} /* PBXTargetDependency */ = {
			isa = PBXTargetDependency;
			target = ${ids.appTarget} /* ${projectName} */;
			targetProxy = ${ids.containerItemProxy} /* PBXContainerItemProxy */;
		};
/* End PBXTargetDependency section */

/* Begin XCBuildConfiguration section */
		${ids.projectBuildConfig} /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ALWAYS_SEARCH_USER_PATHS = NO;
				ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = YES;
				CLANG_ANALYZER_NONNULL = YES;
				CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION = YES_AGGRESSIVE;
				CLANG_CXX_LANGUAGE_STANDARD = "gnu++20";
				CLANG_ENABLE_MODULES = YES;
				CLANG_ENABLE_OBJC_ARC = YES;
				CLANG_ENABLE_OBJC_WEAK = YES;
				CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING = YES;
				CLANG_WARN_BOOL_CONVERSION = YES;
				CLANG_WARN_COMMA = YES;
				CLANG_WARN_CONSTANT_CONVERSION = YES;
				CLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS = YES;
				CLANG_WARN_DIRECT_OBJC_ISA_USAGE = YES_ERROR;
				CLANG_WARN_DOCUMENTATION_COMMENTS = YES;
				CLANG_WARN_EMPTY_BODY = YES;
				CLANG_WARN_ENUM_CONVERSION = YES;
				CLANG_WARN_INFINITE_RECURSION = YES;
				CLANG_WARN_INT_CONVERSION = YES;
				CLANG_WARN_NON_LITERAL_NULL_CONVERSION = YES;
				CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF = YES;
				CLANG_WARN_OBJC_LITERAL_CONVERSION = YES;
				CLANG_WARN_OBJC_ROOT_CLASS = YES_ERROR;
				CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER = YES;
				CLANG_WARN_RANGE_LOOP_ANALYSIS = YES;
				CLANG_WARN_STRICT_PROTOTYPES = YES;
				CLANG_WARN_SUSPICIOUS_MOVE = YES;
				CLANG_WARN_UNGUARDED_AVAILABILITY = YES_AGGRESSIVE;
				CLANG_WARN_UNREACHABLE_CODE = YES;
				CLANG_WARN__DUPLICATE_METHOD_MATCH = YES;
				COPY_PHASE_STRIP = NO;
				DEBUG_INFORMATION_FORMAT = dwarf;
				ENABLE_STRICT_OBJC_MSGSEND = YES;
				ENABLE_TESTABILITY = YES;
				ENABLE_USER_SCRIPT_SANDBOXING = YES;
				GCC_C_LANGUAGE_STANDARD = gnu17;
				GCC_DYNAMIC_NO_PIC = NO;
				GCC_NO_COMMON_BLOCKS = YES;
				GCC_OPTIMIZATION_LEVEL = 0;
				GCC_PREPROCESSOR_DEFINITIONS = (
					"DEBUG=1",
					"$(inherited)",
				);
				GCC_WARN_64_TO_32_BIT_CONVERSION = YES;
				GCC_WARN_ABOUT_RETURN_TYPE = YES_ERROR;
				GCC_WARN_UNDECLARED_SELECTOR = YES;
				GCC_WARN_UNINITIALIZED_AUTOS = YES_AGGRESSIVE;
				GCC_WARN_UNUSED_FUNCTION = YES;
				GCC_WARN_UNUSED_VARIABLE = YES;
				IPHONEOS_DEPLOYMENT_TARGET = 15.0;
				LOCALIZATION_PREFERS_STRING_CATALOGS = YES;
				MTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;
				MTL_FAST_MATH = YES;
				ONLY_ACTIVE_ARCH = YES;
				SDKROOT = iphoneos;
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";
				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
			};
			name = Debug;
		};
		${ids.appBuildConfig} /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_FILE = "${projectName}/Info.plist";
				INFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES;
				INFOPLIST_KEY_UILaunchStoryboardName = "";
				INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad = "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
				INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = "${appBundleId}";
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_EMIT_LOC_STRINGS = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			};
			name = Debug;
		};
		${ids.testBuildConfig} /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_FILE = "${testTargetName}/Info.plist";
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
					"@loader_path/Frameworks",
				);
				MARKETING_VERSION = 1.0;
				PRODUCT_BUNDLE_IDENTIFIER = "${testBundleId}";
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_EMIT_LOC_STRINGS = NO;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
				TEST_TARGET_NAME = "${projectName}";
			};
			name = Debug;
		};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		${ids.projectConfigList} /* Build configuration list for PBXProject "${projectName}" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				${ids.projectBuildConfig} /* Debug */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Debug;
		};
		${ids.appConfigList} /* Build configuration list for PBXNativeTarget "${projectName}" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				${ids.appBuildConfig} /* Debug */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Debug;
		};
		${ids.testConfigList} /* Build configuration list for PBXNativeTarget "${testTargetName}" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				${ids.testBuildConfig} /* Debug */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Debug;
		};
/* End XCConfigurationList section */
	};
	rootObject = ${ids.project} /* Project object */;
}
`;
}

// =============================================================================
// Building
// =============================================================================

/**
 * Build the UI inspector test bundle.
 *
 * @param options - Build options
 * @returns Build result with bundle path
 */
export async function buildInspector(
  options: BuildInspectorOptions
): Promise<IOSResult<BuildInspectorResult>> {
  const {
    projectPath,
    destination,
    derivedDataPath = path.join(projectPath, 'DerivedData'),
    configuration = 'Debug',
  } = options;

  const startTime = Date.now();
  const projectName = path.basename(projectPath);
  const xcodeprojPath = path.join(projectPath, `${projectName}.xcodeproj`);

  logger.info(`${LOG_CONTEXT} Building inspector project: ${xcodeprojPath}`, LOG_CONTEXT);

  // Prepare destination string
  let destinationArg = destination;
  if (destination.match(/^[A-F0-9-]{36}$/i)) {
    destinationArg = `id=${destination}`;
  }

  // Build for testing
  const args = [
    '-project', xcodeprojPath,
    '-scheme', `${projectName}UITests`,
    '-configuration', configuration,
    '-destination', destinationArg,
    '-derivedDataPath', derivedDataPath,
    '-sdk', 'iphonesimulator',
    'build-for-testing',
  ];

  const result = await runXcodebuild(args, projectPath);
  const duration = (Date.now() - startTime) / 1000;

  // Parse the output
  const parsed = parseXcodebuildOutput(result.stdout + '\n' + result.stderr);

  if (result.exitCode !== 0 || !parsed.success) {
    const errorMessages = parsed.errors.map(e => e.message).join('; ');
    return {
      success: false,
      error: errorMessages || 'Build failed',
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Find the built xctest bundle
  const bundlePath = path.join(
    derivedDataPath,
    'Build', 'Products',
    `${configuration}-iphonesimulator`,
    `${projectName}UITests.xctest`
  );

  if (!existsSync(bundlePath)) {
    return {
      success: false,
      error: `Built bundle not found at ${bundlePath}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  logger.info(`${LOG_CONTEXT} Build completed in ${duration.toFixed(1)}s: ${bundlePath}`, LOG_CONTEXT);

  return {
    success: true,
    data: {
      bundlePath,
      derivedDataPath,
      duration,
      warnings: parsed.warnings.map(w => w.message),
    },
  };
}

// =============================================================================
// Running
// =============================================================================

/**
 * Run the UI inspector on a target app.
 *
 * @param options - Run options
 * @returns Inspection result with UI tree
 */
export async function runInspector(
  options: RunInspectorOptions
): Promise<IOSResult<RunInspectorResult>> {
  const {
    bundlePath,
    appBundleId,
    simulatorUdid,
    projectPath,
    maxDepth,
    includeHidden = false,
    includeFrames = true,
    // Note: timeout is defined in interface but xcodebuild handles its own test timeouts
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    timeout: _timeout = 60000,
  } = options;

  logger.info(`${LOG_CONTEXT} Running inspector for ${appBundleId} on ${simulatorUdid}`, LOG_CONTEXT);

  // Verify bundle exists
  if (!existsSync(bundlePath)) {
    return {
      success: false,
      error: `Test bundle not found: ${bundlePath}`,
      errorCode: 'COMMAND_FAILED',
    };
  }

  // Build environment variables for the test
  const testEnv: Record<string, string> = {
    MAESTRO_TARGET_BUNDLE_ID: appBundleId,
    MAESTRO_INCLUDE_HIDDEN: includeHidden ? 'true' : 'false',
    MAESTRO_INCLUDE_FRAMES: includeFrames ? 'true' : 'false',
  };

  if (maxDepth !== undefined) {
    testEnv.MAESTRO_MAX_DEPTH = String(maxDepth);
  }

  // Build xcodebuild args for test-without-building
  const projectName = path.basename(path.dirname(bundlePath).replace(/Build.*/, '').replace(/DerivedData.*/, ''));
  const derivedDataPath = bundlePath.replace(/\/Build\/.*/, '');

  const args = [
    'test-without-building',
    '-xctestrun', findXCTestRun(derivedDataPath) || '',
    '-destination', `id=${simulatorUdid}`,
    '-only-testing', `${projectName}UITests/${projectName}UITests/testInspectUI`,
  ];

  // If we don't have xctestrun, use the project
  if (!args[2] && projectPath) {
    const xcodeprojPath = path.join(projectPath, `${projectName}.xcodeproj`);
    args.splice(1, 2,
      '-project', xcodeprojPath,
      '-scheme', `${projectName}UITests`,
      '-destination', `id=${simulatorUdid}`,
      '-derivedDataPath', derivedDataPath,
    );
  }

  // Merge environment variables for xcodebuild
  // Note: We pass environment through the process.env merge since
  // execFileNoThrow doesn't support timeout directly. The xcodebuild
  // command itself has its own timeout handling for tests.
  const mergedEnv: NodeJS.ProcessEnv = { ...process.env, ...testEnv };

  // Run the test
  const result = await execFileNoThrow(
    'xcodebuild',
    args,
    undefined, // cwd
    mergedEnv
  );

  // Parse the output to find the JSON result
  const inspectorResult = parseInspectorOutput(result.stdout + '\n' + result.stderr);

  if (!inspectorResult) {
    // Check for common errors
    if (result.stdout.includes('Application is not running')) {
      return {
        success: false,
        error: 'Target application is not running. Launch the app first.',
        errorCode: 'COMMAND_FAILED',
      };
    }

    if (result.exitCode !== 0) {
      return {
        success: false,
        error: `Test execution failed with exit code ${result.exitCode}`,
        errorCode: 'COMMAND_FAILED',
      };
    }

    return {
      success: false,
      error: 'Failed to parse inspector output',
      errorCode: 'PARSE_ERROR',
    };
  }

  return {
    success: true,
    data: inspectorResult,
  };
}

/**
 * Find the .xctestrun file in derived data
 */
function findXCTestRun(derivedDataPath: string): string | undefined {
  const productsPath = path.join(derivedDataPath, 'Build', 'Products');

  try {
    const files = require('fs').readdirSync(productsPath);
    const xctestrun = files.find((f: string) => f.endsWith('.xctestrun'));
    if (xctestrun) {
      return path.join(productsPath, xctestrun);
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return undefined;
}

/**
 * Parse the inspector output from stdout/stderr.
 *
 * Looks for JSON between OUTPUT_START_MARKER and OUTPUT_END_MARKER.
 *
 * @param output - Combined stdout/stderr from xcodebuild
 * @returns Parsed inspector result or undefined
 */
export function parseInspectorOutput(output: string): RunInspectorResult | undefined {
  // Find markers
  const startIndex = output.indexOf(OUTPUT_START_MARKER);
  const endIndex = output.indexOf(OUTPUT_END_MARKER);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    logger.debug(`${LOG_CONTEXT} No inspector output markers found`, LOG_CONTEXT);
    return undefined;
  }

  // Extract JSON
  const jsonStr = output.slice(startIndex + OUTPUT_START_MARKER.length, endIndex).trim();

  try {
    const result = JSON.parse(jsonStr) as RunInspectorResult;

    // Validate required fields
    if (result.success === undefined || !result.bundleId) {
      logger.warn(`${LOG_CONTEXT} Invalid inspector result structure`, LOG_CONTEXT);
      return undefined;
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`${LOG_CONTEXT} Failed to parse inspector JSON: ${message}`, LOG_CONTEXT);
    return undefined;
  }
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Clean up a temporary inspector project.
 *
 * @param projectPath - Path to the project directory
 * @returns Success status
 */
export async function cleanupInspectorProject(projectPath: string): Promise<IOSResult<void>> {
  logger.info(`${LOG_CONTEXT} Cleaning up inspector project: ${projectPath}`, LOG_CONTEXT);

  try {
    // Verify this looks like our project before deleting
    if (!projectPath.includes('maestro-inspector') && !projectPath.includes('MaestroInspector')) {
      return {
        success: false,
        error: 'Path does not appear to be a Maestro inspector project',
        errorCode: 'COMMAND_FAILED',
      };
    }

    await fs.rm(projectPath, { recursive: true, force: true });

    logger.info(`${LOG_CONTEXT} Cleaned up project: ${projectPath}`, LOG_CONTEXT);

    return {
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`${LOG_CONTEXT} Failed to cleanup project: ${message}`, LOG_CONTEXT);

    return {
      success: false,
      error: `Failed to cleanup: ${message}`,
      errorCode: 'COMMAND_FAILED',
    };
  }
}

// =============================================================================
// Caching
// =============================================================================

/**
 * Get or build a cached inspector bundle.
 *
 * Checks if a pre-built inspector exists in the cache directory.
 * If not, creates and builds one.
 *
 * @param simulatorUdid - Target simulator UDID
 * @returns Path to the built bundle
 */
export async function getCachedInspector(
  simulatorUdid: string
): Promise<IOSResult<{ bundlePath: string; projectPath: string }>> {
  // Check cache directory
  const cacheDir = CACHE_DIR;
  const projectPath = path.join(cacheDir, 'MaestroInspector');
  const bundlePath = path.join(projectPath, 'DerivedData', 'Build', 'Products', 'Debug-iphonesimulator', 'MaestroInspectorUITests.xctest');

  // Check if Swift sources have changed
  const sourcesHash = await hashSwiftSources();
  const hashFile = path.join(cacheDir, '.source-hash');

  let needsRebuild = true;

  if (existsSync(bundlePath) && existsSync(hashFile)) {
    try {
      const cachedHash = await fs.readFile(hashFile, 'utf-8');
      if (cachedHash.trim() === sourcesHash) {
        logger.info(`${LOG_CONTEXT} Using cached inspector bundle`, LOG_CONTEXT);
        needsRebuild = false;
      }
    } catch {
      // Cache invalid, rebuild
    }
  }

  if (needsRebuild) {
    logger.info(`${LOG_CONTEXT} Building inspector (cache miss or source changed)`, LOG_CONTEXT);

    // Clean old cache
    await fs.rm(cacheDir, { recursive: true, force: true });
    await fs.mkdir(cacheDir, { recursive: true });

    // Create project
    const createResult = await createInspectorProject({
      outputDir: cacheDir,
    });

    if (!createResult.success) {
      return {
        success: false,
        error: createResult.error,
        errorCode: createResult.errorCode,
      };
    }

    // Build
    const buildResult = await buildInspector({
      projectPath: createResult.data!.projectPath,
      destination: simulatorUdid,
    });

    if (!buildResult.success) {
      return {
        success: false,
        error: buildResult.error,
        errorCode: buildResult.errorCode,
      };
    }

    // Save hash
    await fs.writeFile(hashFile, sourcesHash);

    return {
      success: true,
      data: {
        bundlePath: buildResult.data!.bundlePath,
        projectPath: createResult.data!.projectPath,
      },
    };
  }

  return {
    success: true,
    data: {
      bundlePath,
      projectPath,
    },
  };
}

/**
 * Generate a hash of the Swift source files
 */
async function hashSwiftSources(): Promise<string> {
  const sourceFiles = ['ElementNode.swift', 'UIInspector.swift', 'InspectorOutput.swift'];
  let combined = '';

  for (const file of sourceFiles) {
    const filePath = path.join(SWIFT_SOURCE_DIR, file);
    if (existsSync(filePath)) {
      const content = await fs.readFile(filePath, 'utf-8');
      combined += content;
    }
  }

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(16);
}

/**
 * Clear the inspector cache
 */
export async function clearInspectorCache(): Promise<IOSResult<void>> {
  logger.info(`${LOG_CONTEXT} Clearing inspector cache`, LOG_CONTEXT);

  try {
    await fs.rm(CACHE_DIR, { recursive: true, force: true });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to clear cache: ${message}`,
      errorCode: 'COMMAND_FAILED',
    };
  }
}
