# Auto-Injetor 🤖🚀

An advanced and universal Tampermonkey script that automates lesson progress and intelligently solves assessments on modern E-Learning platforms like Unicte, Noz, Cademi, and SpBIM.

## 🔥 Key Features

- **SpBIM Direct API Engine (V15.0):**
  - Automatically parses the Inertia.js course tree (`moduleTree`) to map all lessons across every module.
  - Sends authenticated completion requests (`POST /student/complete`) directly to the backend, completing entire courses in seconds without needing to play videos or click the sidebar.
  - Real-time floating HUD showing completion progress (`completed/total`), server validation status, and direct certificate access.
- **Auto-Advance:** Detects and skips lessons that have already been completed.
- **Video Bypass (Iframes and Native):** Bypasses video players like Vimeo, YouTube, and PandaVideo, instantly simulating that the video has been watched to the end.
- **Multi-Threaded Quiz Solver:** 
  - Maps multiple questions on a single screen.
  - For Multiple-Choice quizzes: Identifies correct answers by color feedback (green = correct, red = try again) and learns the correct answer autonomously in an asynchronous way.
  - For Checkbox Challenges: Uses asynchronous brute-force to discover the exact combinations in quizzes that require "multiple correct answers".
- **Ghost Writer:** Identifies open-ended essay text boxes in assessments and fills them natively, bypassing React blocks.
- **500ms Radar System:** Does not rely on page reloads. The bot reacts in real-time within the SPA (Single Page Application) architecture.

## 📥 How to Install

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension in your browser.
2. Create a new script.
3. Copy the entire content of the `auto-injetor.user.js` file and paste it into the Tampermonkey dashboard.
4. Save and enable the script.

## 🛠️ Supported Technologies

- SPA Platforms (React/Vue/Inertia.js/Remix)
- Domains natively supported: `unicte.com`, `appnoz.com.br`, `spbim.com.br`, and Cademi-based platforms.

## 📝 License

This project is licensed under the [MIT License](LICENSE).

---
*Disclaimer: This project was created for educational and test automation purposes.*
