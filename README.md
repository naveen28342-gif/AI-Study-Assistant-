AI Study Assistant 🎓

An AI-powered study companion that turns any PDF into an interactive personal tutor. Upload a document and chat with it, generate summaries, take auto-generated quizzes, and study with smart flashcards — all powered by the Gemini API.

✨ Features


📄 PDF Contextual Chat — Upload any PDF and ask questions directly about its content. The assistant remembers conversation history, so follow-up questions stay in context.
📝 Auto-Summarization — Generate a clean, structured markdown summary of the document's main topics, key concepts, and findings in one click.
🎯 Smart Quizzes — Automatically generates up to 50 multiple-choice questions based on the document's unique facts and concepts, with progress tracking and accuracy stats.
🗂️ Dynamic Flashcards — Creates flashcard decks from the text while tracking previously covered topics, so new decks always explore fresh material instead of repeating itself.
🔒 Local-First & Private — No backend database. Chat history is saved in localStorage, and PDFs are cached locally using IndexedDB.
🎨 Polished UX — Word-by-word streaming animations for AI responses and a clean markdown renderer for readable study notes.


🛠️ Tech Stack

LayerTechnologyFrontendReact (TypeScript) + ViteStylingTailwind CSSAI EngineGemini API (gemini-2.5-flash, with flash-lite fallback)AI Endpointv1beta/interactions for contextual prompts & strict JSON generationStoragelocalStorage (chat history) + IndexedDB (PDF caching)

🚀 Getting Started

Prerequisites


Node.js (v18 or higher)
A Gemini API key (Get one here)


Installation

bash# Clone the repository
git clone https://github.com/<your-username>/ai-study-assistant.git
cd ai-study-assistant

# Install dependencies
npm install

# Create a .env file and add your Gemini API key
echo "VITE_GEMINI_API_KEY=your_api_key_here" > .env

# Run the development server
npm run dev

The app will be available at http://localhost:5173 (or the port shown in your terminal).

📖 How It Works


Upload a PDF — The document is parsed and cached locally in IndexedDB.
Chat, Summarize, Quiz, or Flashcard — Choose how you want to study the material.
Context-Aware AI — Every request sends relevant document context and prior conversation history to Gemini for accurate, grounded responses.
Strict JSON for Quizzes/Flashcards — Structured prompts ensure quiz and flashcard data returns in a predictable format for rendering.


🎯 Roadmap


 Support for multiple simultaneous documents
 Export quiz results and flashcard decks
 Dark/light theme toggle
 Multi-language support


🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page or open a pull request.

📄 License

This project is open source and available under the MIT License.

👨‍💻 Author

Naveen Kumar D


GitHub: @naveen28342-gif
LinkedIn: naveen28342
Portfolio: naveen28342-gif.github.io/my-portfolio-website














