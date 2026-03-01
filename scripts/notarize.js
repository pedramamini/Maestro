const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
	const { electronPlatformName, appOutDir } = context;

	// Only notarize macOS builds
	if (electronPlatformName !== 'darwin') {
		return;
	}

	// Skip if not signing (CI without credentials, etc.)
	if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
		console.log('Skipping notarization: CSC_IDENTITY_AUTO_DISCOVERY is false');
		return;
	}

	const appName = context.packager.appInfo.productFilename;
	const appPath = `${appOutDir}/${appName}.app`;

	console.log(`Notarizing ${appPath}...`);

	try {
		await notarize({
			appPath,
			appleId: process.env.APPLE_ID,
			appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
			teamId: process.env.APPLE_TEAM_ID,
		});
		console.log('Notarization complete!');
	} catch (error) {
		console.error('Notarization failed:', error);
		throw error;
	}
};
