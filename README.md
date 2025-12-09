#Trainlog router redirect extension
A browser extension for Chromium browsers and Firefox for [Trainlog](https://trainlog.me). It redirects routing requests asking for the new rail router to openrailrouting.kaelon.dev, a replacement instance for Maahl's router which is down at the time of writing. By installing this extension you'll be able to use the new router again.

## Installation (Firefox)
1. Download this project (`git clone https://github.com/kaelon141/trainlog-router-redirect`, or [download as zip](https://github.com/kaelon141/trainlog-router-redirect/archive/refs/heads/main.zip) and extract)
2. Open a tab in firefox and enter `about:debugging` in the URL bar
3. In the menu on the left, click "This Firefox"
4. Near the top, click the button "Load Temporary Add-on...". Select the manifest.json file in this project directory.
5. That's it! the extension is installed, and you will be able to use the new train router again.

## Installation (Chrome / Chromium browsers)
1. Download this project (`git clone https://github.com/kaelon141/trainlog-router-redirect`, or [download as zip](https://github.com/kaelon141/trainlog-router-redirect/archive/refs/heads/main.zip) and extract)
2. Open a tab and enter `chrome://extensions` (Google Chrome) or `edge://extensions` (Microsoft Edge) or 'your-browsers-prefix://extensions' in the URL bar
3. Click the "Load unpacked" button. Select the manifest.json file in this project directory.
5. That's it! the extension is installed, and you will be able to use the new train router again.