# 🚀 Installation Guide - ReadEasy Extension

## Step-by-Step Installation

### Step 1: Open Chrome Extensions Page
1. Open Google Chrome
2. Click the three dots menu (⋮) in the top-right corner
3. Go to: **Extensions** → **Manage Extensions**
   
   OR simply type in the address bar:
   ```
   chrome://extensions/
   ```

### Step 2: Enable Developer Mode
1. Look for the **Developer mode** toggle in the top-right corner
2. Click to turn it **ON** (it should turn blue)

### Step 3: Load the Extension
1. Click the **"Load unpacked"** button (appears after enabling Developer mode)
2. Navigate to and select this folder:
   ```
   /Users/pulkit.vashishta/Downloads/chrome-extension
   ```
3. Click **"Select"** or **"Open"**

### Step 4: Verify Installation
You should see a card for "ReadEasy" with:
- ✅ Extension name: **ReadEasy**
- ✅ Version: **1.0.0**
- ✅ Blue book icon
- ✅ Status: **Enabled**
- ✅ No errors shown

### Step 5: Pin the Extension (Recommended)
1. Click the **puzzle piece icon** (🧩) in Chrome's toolbar
2. Find **"ReadEasy"** in the list
3. Click the **pin icon** next to it
4. The ReadEasy icon will now appear in your toolbar

## ✅ You're Ready!

### Test It Out:

1. **Visit an article** - Try one of these:
   - https://medium.com (any article)
   - https://en.wikipedia.org/wiki/Web_browser
   - Any news site article

2. **Click the ReadEasy icon** in your toolbar

3. **Enjoy!** The article will open in a clean, readable format

## 🎨 Customize Your Experience

Once the reader view opens:
- **Change theme**: Click A buttons (Light/Sepia/Dark)
- **Adjust font**: Use +/- buttons
- **Change width**: Click the width toggle button
- **Go back**: Click "Original" link or close the tab

## Keyboard Shortcuts

While in Reader View:
- Press **+** or **=** to increase font size
- Press **-** to decrease font size
- Press **ESC** to close reader view

## 🔧 Troubleshooting

### Icon doesn't appear?
- Refresh the extensions page
- Check that all files are in the folder
- Try disabling and re-enabling the extension

### Extension shows errors?
- Check the console in the extension card
- Verify all files are present (see checklist below)
- Try removing and re-installing

### Not extracting content?
- Make sure you're on an article/blog page
- Some complex sites may not work perfectly
- Try a different article first

## 📋 File Checklist

Before installing, verify these files exist:

```
✅ manifest.json
✅ background.js
✅ content.js
✅ reader.html
✅ reader.js
✅ reader.css
✅ libs/Readability.js
✅ icons/icon16.png
✅ icons/icon32.png
✅ icons/icon48.png
✅ icons/icon128.png
```

## 📱 What to Expect

### Works Great On:
- ✅ Blog posts (Medium, WordPress, etc.)
- ✅ News articles (CNN, BBC, NYT, etc.)
- ✅ Documentation pages
- ✅ Wikipedia articles
- ✅ Tutorial/how-to content

### Limited Support:
- ⚠️ Social media posts
- ⚠️ Single-page apps (SPAs)
- ⚠️ Dashboards
- ⚠️ Forums

### Won't Work On:
- ❌ Chrome internal pages (chrome://)
- ❌ Extension pages (chrome-extension://)
- ❌ Chrome Web Store

## 🎉 Success!

If you see the clean reader view when you click the icon on an article, you're all set!

The extension:
- Extracts main content automatically
- Removes ads and distractions
- Formats text for easy reading
- Remembers your preferences

**Happy reading! 📖**

---

Need help? Check:
- [README.md](README.md) - Full documentation
- [TESTING.md](TESTING.md) - Testing checklist
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Technical overview
