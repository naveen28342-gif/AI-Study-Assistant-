import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  generateSummaryFromDocument,
  generateQuizFromDocument,
  generateFlashcardsFromDocument,
  askQuestionAboutDocument,
  askQuestionWithMemory,
  getFileIcon,
  isImageFile,
  type QuizQuestion,
  type Flashcard,
} from "./services/gemini";
import { useAuth } from "./hooks/useAuth";
import AuthPage from "./components/AuthPage";
import ProfilePage from "./components/ProfilePage";
import PrivacyPolicy from "./components/PrivacyPolicy";
import TermsAndConditions from "./components/TermsAndConditions";
import {
  saveConversation,
  saveMessage,
  updateMessageInDb,
  loadUserConversations,
  deleteConversationFromDb,
  clearMessagesFromDb,
} from "./services/database";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "summary" | "quiz" | "flashcards";
  quizQuestions?: QuizQuestion[];
  flashcards?: Flashcard[];
  quizAnswers?: Record<number, string>;
  quizResult?: { correct: number; total: number } | null;
  flashcardIndex?: number;
};

type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  pdfFile: File | null;
  pdfName: string;
  timestamp: string;
  previewUrl?: string | null;
};

type QuizProgress = {
  completedQuizzes: number;
  totalCorrect: number;
  totalQuestions: number;
};

type AppView = 'chat' | 'profile' | 'privacy' | 'terms';

const ACCEPTED_FILE_TYPES =
  "image/*,application/pdf,.doc,.docx,.txt,.csv,.tsv,.md,.markdown,.json,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.sql,.log,.rtf,.xlsx,.xls,.pptx,.ppt,text/*";

function formatFileSize(bytes?: number): string {
  if (!bytes || isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMessageForMemory(message: Message): string {
  const extraQuizContent = message.quizQuestions
    ?.map((question, index) => `${index + 1}. ${question.question} Answer: ${question.answer}`)
    .join("\n");
  const extraFlashcardContent = message.flashcards
    ?.map((card, index) => `${index + 1}. ${card.front} - ${card.back}`)
    .join("\n");

  return [message.content, extraQuizContent, extraFlashcardContent]
    .filter(Boolean)
    .join("\n");
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    const emphasisMatch = part.match(/^\*{1,2}([^*]+)\*{1,2}$/);
    if (emphasisMatch) {
      return <strong key={index}>{emphasisMatch[1]}</strong>;
    }
    return part;
  });
}

function renderMarkdownContent(content: string, className = "markdown-content") {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let orderedItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const paragraph = paragraphLines.join(" ").trim();
    const labelMatch = paragraph.match(/^([^:]{2,48}):\s+(.+)$/);

    blocks.push(
      <p key={`p-${blocks.length}`}>
        {labelMatch ? (
          <>
            <strong>{labelMatch[1]}:</strong> {renderInlineMarkdown(labelMatch[2])}
          </>
        ) : (
          renderInlineMarkdown(paragraph)
        )}
      </p>
    );
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {listItems.map((item, index) => (
          <li key={index}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  const flushOrderedList = () => {
    if (!orderedItems.length) return;
    blocks.push(
      <ol key={`ol-${blocks.length}`}>
        {orderedItems.map((item, index) => (
          <li key={index}>{renderInlineMarkdown(item)}</li>
        ))}
      </ol>
    );
    orderedItems = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      flushOrderedList();
      return;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushOrderedList();
      blocks.push(
        <h4 key={`h-${blocks.length}`}>
          {renderInlineMarkdown(headingMatch[2].trim())}
        </h4>
      );
      return;
    }

    const numberedHeadingMatch = line.match(/^\d+\.\s+(.{3,80})$/);
    const looksLikeSentence = /[.!?]$/.test(numberedHeadingMatch?.[1] || "");
    if (numberedHeadingMatch && !looksLikeSentence) {
      flushParagraph();
      flushList();
      flushOrderedList();
      blocks.push(
        <h4 key={`nh-${blocks.length}`}>
          {renderInlineMarkdown(numberedHeadingMatch[1].trim())}
        </h4>
      );
      return;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      flushOrderedList();
      listItems.push(listMatch[1].trim());
      return;
    }

    const orderedListMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedListMatch) {
      flushParagraph();
      flushList();
      orderedItems.push(orderedListMatch[1].trim());
      return;
    }

    flushList();
    flushOrderedList();
    paragraphLines.push(line);
  });

  flushParagraph();
  flushList();
  flushOrderedList();

  return <div className={className}>{blocks}</div>;
}

function wrapWordsWithAnimation(node: React.ReactNode, wordIndexRef: { current: number }): React.ReactNode {
  if (typeof node === "string") {
    const words = node.split(/(\s+)/);
    return words.map((word, i) => {
      if (word.trim().length > 0) {
        const idx = wordIndexRef.current++;
        return (
          <span
            key={i}
            className="word-fade-in"
            style={{ animationDelay: `${idx * 0.04}s`, display: "inline-block", whiteSpace: "pre-wrap" }}
          >
            {word}
          </span>
        );
      }
      return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{word}</span>;
    });
  }

  if (React.isValidElement(node)) {
    const children = React.Children.toArray(node.props.children).map((child) =>
      wrapWordsWithAnimation(child, wordIndexRef)
    );
    return React.cloneElement(node as React.ReactElement, {}, children);
  }

  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <React.Fragment key={i}>
        {wrapWordsWithAnimation(child, wordIndexRef)}
      </React.Fragment>
    ));
  }

  return node;
}

function AnimatedTextMessage({ content, animate, className = "markdown-content" }: { content: string; animate: boolean; className?: string }) {
  const wordIndexRef = React.useRef(0);
  wordIndexRef.current = 0;
  const rendered = renderMarkdownContent(content, className);

  if (!animate) {
    return rendered;
  }

  return (
    <div className={`animated-message-content ${className}`}>
      {wrapWordsWithAnimation(rendered, wordIndexRef)}
    </div>
  );
}

export function App() {
  const { user, profile, loading: authLoading, signInWithGoogle, signOut, refreshProfile } = useAuth();
  const [currentView, setCurrentView] = useState<AppView>('chat');
  const [activeNavTab, setActiveNavTab] = useState<'chatbot' | 'dashboard' | 'quizzes' | 'flashcards' | 'help'>('chatbot');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: "chat-1",
      title: "Study Session 1",
      messages: [],
      pdfFile: null,
      pdfName: "No file selected",
      timestamp: "Just now"
    }
  ]);
  const [activeConversationId, setActiveConversationId] = useState<string>('chat-1');
  const [conversationStatuses, setConversationStatuses] = useState<Record<string, string>>({});
  const [inputMessage, setInputMessage] = useState("");
  const [loadingConversationIds, setLoadingConversationIds] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [quizProgressByConversation, setQuizProgressByConversation] = useState<Record<string, QuizProgress>>({});
  const [openConversationMenuId, setOpenConversationMenuId] = useState<string | null>(null);
  const [animatedMessageId, setAnimatedMessageId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatContainerRef = useRef<HTMLElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const activeConversation = useMemo(() => {
    return conversations.find((item) => item.id === activeConversationId);
  }, [conversations, activeConversationId]);

  const activeQuizProgress = quizProgressByConversation[activeConversationId] || {
    completedQuizzes: 0,
    totalCorrect: 0,
    totalQuestions: 0
  };

  const progressRate = useMemo(() => {
    if (!activeQuizProgress.totalQuestions) return 0;
    return Math.round((activeQuizProgress.totalCorrect / activeQuizProgress.totalQuestions) * 100);
  }, [activeQuizProgress]);

  const activeStatus = conversationStatuses[activeConversationId] || "Ready";
  const isActiveConversationLoading = Boolean(loadingConversationIds[activeConversationId]);

  // Load conversations from Supabase on login
  useEffect(() => {
    if (!user || dataLoaded) return;

    loadUserConversations(user.id).then(({ conversations: dbConvs, messages: dbMsgs }) => {
      if (dbConvs.length === 0) {
        const defaultConv: Conversation = {
          id: `chat-${Date.now()}`,
          title: 'Study Session 1',
          messages: [],
          pdfFile: null,
          pdfName: 'No file selected',
          timestamp: 'Just now',
        };
        setConversations([defaultConv]);
        setActiveConversationId(defaultConv.id);
        saveConversation(user.id, defaultConv).catch(console.error);
      } else {
        const loadedConvs: Conversation[] = dbConvs.map((dbConv) => {
          const convMsgs = dbMsgs
            .filter((m) => m.conversation_id === dbConv.id)
            .map((m): Message => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              type: m.type as Message['type'],
              quizQuestions: m.quiz_questions as QuizQuestion[] | undefined,
              flashcards: m.flashcards as Flashcard[] | undefined,
              quizAnswers: m.quiz_answers as Record<number, string> | undefined,
              quizResult: m.quiz_result as { correct: number; total: number } | null | undefined,
              flashcardIndex: m.flashcard_index ?? 0,
            }));

          return {
            id: dbConv.id,
            title: dbConv.title,
            messages: convMsgs,
            pdfFile: null,
            pdfName: dbConv.pdf_name || 'No file selected',
            timestamp: dbConv.timestamp || (dbConv.created_at ? new Date(dbConv.created_at).toLocaleDateString() : 'Just now'),
          };
        });

        setConversations(loadedConvs);
        setActiveConversationId(loadedConvs[0]?.id || `chat-${Date.now()}`);
      }
      setDataLoaded(true);
    }).catch((err) => {
      console.error('Error loading data from Supabase:', err);
      setDataLoaded(true);
    });
  }, [user, dataLoaded]);

  const setConversationLoading = (conversationId: string, isLoading: boolean) => {
    setLoadingConversationIds((prev) => ({
      ...prev,
      [conversationId]: isLoading
    }));
  };

  const setConversationStatus = (conversationId: string, statusText: string) => {
    setConversationStatuses((prev) => ({
      ...prev,
      [conversationId]: statusText
    }));
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages]);

  const addMessage = (conversationId: string, message: Omit<Message, "id">) => {
    const newMessage: Message = {
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    };

    setConversations((prev) =>
      prev.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const messages = [...conversation.messages, newMessage];
        const title =
          conversation.title === "Study Session 1" &&
            message.role === "user" &&
            conversation.messages.length === 0
            ? message.content.slice(0, 24) || "Study Session 1"
            : conversation.title;
        return { ...conversation, title, messages };
      })
    );

    if (newMessage.role === "assistant") {
      setAnimatedMessageId(newMessage.id);
    }

    if (user) {
      saveMessage(user.id, conversationId, {
        id: newMessage.id,
        role: newMessage.role,
        content: newMessage.content,
        type: newMessage.type,
        quizQuestions: newMessage.quizQuestions,
        flashcards: newMessage.flashcards,
        quizAnswers: newMessage.quizAnswers,
        quizResult: newMessage.quizResult,
        flashcardIndex: newMessage.flashcardIndex,
      }).catch(console.error);
    }
  };

  const updateMessage = (
    conversationId: string,
    messageId: string,
    updater: (msg: Message) => Partial<Message>
  ) => {
    let updates: Partial<Message> = {};

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
            ...c,
            messages: c.messages.map((m) => {
              if (m.id === messageId) {
                updates = updater(m);
                return { ...m, ...updates };
              }
              return m;
            })
          }
          : c
      )
    );

    if (user && Object.keys(updates).length > 0) {
      updateMessageInDb(user.id, messageId, updates).catch(console.error);
    }
  };

  const handleFileSelected = (file: File) => {
    setError(null);
    let previewUrl: string | null = null;
    if (isImageFile(file)) {
      try {
        previewUrl = URL.createObjectURL(file);
      } catch (err) {
        console.warn("Could not create object URL for image preview", err);
      }
    }

    if (activeConversation?.previewUrl) {
      try {
        URL.revokeObjectURL(activeConversation.previewUrl);
      } catch {}
    }

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId
          ? { ...c, pdfFile: file, pdfName: file.name, previewUrl }
          : c
      )
    );
    setConversationStatus(activeConversationId, `Attached: ${file.name}`);

    if (user && activeConversation) {
      saveConversation(user.id, {
        id: activeConversationId,
        title: activeConversation.title,
        pdfName: file.name,
        timestamp: activeConversation.timestamp,
      }).catch(console.error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleFileSelected(file);
    event.target.value = "";
  };

  const handleRemoveFile = () => {
    if (activeConversation?.previewUrl) {
      try {
        URL.revokeObjectURL(activeConversation.previewUrl);
      } catch {}
    }

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId
          ? { ...c, pdfFile: null, pdfName: "No file selected", previewUrl: null }
          : c
      )
    );
    setConversationStatus(activeConversationId, "File detached");

    if (user && activeConversation) {
      saveConversation(user.id, {
        id: activeConversationId,
        title: activeConversation.title,
        pdfName: 'No file selected',
        timestamp: activeConversation.timestamp,
      }).catch(console.error);
    }
  };

  const handleNewChat = () => {
    const newChat: Conversation = {
      id: `chat-${Date.now()}`,
      title: `Study Session ${conversations.length + 1}`,
      messages: [],
      pdfFile: null,
      pdfName: "No file selected",
      timestamp: "Just now"
    };

    setConversations((prev) => [newChat, ...prev]);
    setActiveConversationId(newChat.id);
    setConversationStatus(newChat.id, "Ready");
    setError(null);

    if (user) {
      saveConversation(user.id, newChat).catch(console.error);
    }
  };

  const handleClearConversation = (conversationId: string) => {
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, messages: [] }
          : conversation
      )
    );
    setQuizProgressByConversation((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    setConversationStatus(conversationId, "Chat cleared");
    setOpenConversationMenuId(null);

    if (user) {
      clearMessagesFromDb(user.id, conversationId).catch(console.error);
    }
  };

  const handleDeleteConversation = (conversationId: string) => {
    setConversations((prev) => {
      if (prev.length === 1) {
        const resetChat: Conversation = {
          id: `chat-${Date.now()}`,
          title: "Study Session 1",
          messages: [],
          pdfFile: null,
          pdfName: "No file selected",
          timestamp: "Just now"
        };
        setActiveConversationId(resetChat.id);
        setConversationStatus(resetChat.id, "New chat session started");
        if (user) {
          saveConversation(user.id, resetChat).catch(console.error);
        }
        return [resetChat];
      }

      const remaining = prev.filter((conversation) => conversation.id !== conversationId);
      if (conversationId === activeConversationId) {
        setActiveConversationId(remaining[0].id);
      }
      return remaining;
    });
    setQuizProgressByConversation((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    setConversationStatuses((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    setLoadingConversationIds((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
    setError(null);
    setOpenConversationMenuId(null);

    if (user) {
      deleteConversationFromDb(user.id, conversationId).catch(console.error);
    }
  };

  const handleGenerateSummary = async () => {
    if (!activeConversation || !activeConversation.pdfFile) {
      setError("Please upload a document or photo first");
      fileInputRef.current?.click();
      return;
    }

    const conversationId = activeConversation.id;
    const file = activeConversation.pdfFile;
    setConversationLoading(conversationId, true);
    setError(null);
    setConversationStatus(conversationId, "Generating summary with AI...");

    addMessage(conversationId, {
      role: "user",
      content: "Please summarize this document for me."
    });

    try {
      const generatedSummary = await generateSummaryFromDocument(file);
      addMessage(conversationId, {
        role: "assistant",
        content: generatedSummary,
        type: "summary"
      });
      setConversationStatus(conversationId, "Summary generated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to generate summary: ${message}`);
      setConversationStatus(conversationId, "Error generating summary");
      console.error(err);
    } finally {
      setConversationLoading(conversationId, false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!activeConversation || !activeConversation.pdfFile) {
      setError("Please upload a document or photo first");
      fileInputRef.current?.click();
      return;
    }

    const conversationId = activeConversation.id;
    const file = activeConversation.pdfFile;
    setConversationLoading(conversationId, true);
    setError(null);
    setConversationStatus(conversationId, "Generating quiz with AI...");

    addMessage(conversationId, {
      role: "user",
      content: "Generate a practice quiz from this material."
    });

    try {
      const questions = await generateQuizFromDocument(file);
      addMessage(conversationId, {
        role: "assistant",
        content: `Here is an interactive ${questions.length}-question practice quiz based on your material:`,
        type: "quiz",
        quizQuestions: questions,
        quizAnswers: {},
        quizResult: null
      });
      setConversationStatus(conversationId, "Quiz created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to generate quiz: ${message}`);
      setConversationStatus(conversationId, "Error generating quiz");
      console.error(err);
    } finally {
      setConversationLoading(conversationId, false);
    }
  };

  const handleGenerateFlashcards = async () => {
    if (!activeConversation || !activeConversation.pdfFile) {
      setError("Please upload a document or photo first");
      fileInputRef.current?.click();
      return;
    }

    const conversationId = activeConversation.id;
    const file = activeConversation.pdfFile;
    setConversationLoading(conversationId, true);
    setError(null);
    setConversationStatus(conversationId, "Generating flashcards with AI...");

    addMessage(conversationId, {
      role: "user",
      content: "Create flashcards from this material."
    });

    try {
      const previousFlashcardPrompts = activeConversation.messages.flatMap((message) =>
        message.flashcards?.map((card) => card.front) || []
      );
      const cards = await generateFlashcardsFromDocument(file, 10, previousFlashcardPrompts);
      addMessage(conversationId, {
        role: "assistant",
        content: `Here is a deck of ${cards.length} new flashcards created from key concepts:`,
        type: "flashcards",
        flashcards: cards,
        flashcardIndex: 0
      });
      setConversationStatus(conversationId, "Flashcards ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to generate flashcards: ${message}`);
      setConversationStatus(conversationId, "Error generating flashcards");
      console.error(err);
    } finally {
      setConversationLoading(conversationId, false);
    }
  };

  const handleSendMessage = async () => {
    if (isActiveConversationLoading) return;
    const query = inputMessage.trim();
    if (!query) return;

    const conversationId = activeConversation!.id;
    const attachedFile = activeConversation?.pdfFile ?? null;
    setInputMessage("");
    setError(null);
    setConversationStatus(conversationId, "Thinking...");

    const history = (activeConversation?.messages ?? [])
      .map((message) => ({
        role: message.role,
        content: formatMessageForMemory(message)
      }))
      .filter((m) => m.content.trim().length > 0);

    addMessage(conversationId, {
      role: "user",
      content: query
    });

    setConversationLoading(conversationId, true);

    try {
      let response: string;
      if (attachedFile) {
        response = await askQuestionAboutDocument(attachedFile, query, history);
      } else {
        response = await askQuestionWithMemory(query, history);
      }
      addMessage(conversationId, {
        role: "assistant",
        content: response,
        type: "text"
      });
      setConversationStatus(conversationId, "Ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to get response: ${message}`);
      setConversationStatus(conversationId, "Error getting response");
      console.error(err);
    } finally {
      setConversationLoading(conversationId, false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    if (prompt === "Summarize notes") {
      handleGenerateSummary();
    } else if (prompt === "Generate quiz") {
      handleGenerateQuiz();
    } else if (prompt === "Create flashcards") {
      handleGenerateFlashcards();
    } else if (prompt === "Photo / Diagram") {
      fileInputRef.current?.click();
    } else {
      setInputMessage(prompt);
    }
  };

  const navigateTo = useCallback((view: AppView) => {
    setCurrentView(view);
    setShowProfileMenu(false);
  }, []);

  const navigateBack = useCallback(() => {
    setCurrentView('chat');
  }, []);

  // ─── Loading state ───
  if (authLoading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand-orb-icon" style={{ margin: "0 auto 16px" }}>⚡</div>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Starting Study-AI...</h2>
        </div>
      </div>
    );
  }

  // ─── Unauthenticated Gate ───
  if (!user) {
    return <AuthPage onSignIn={signInWithGoogle} onNavigate={(v) => navigateTo(v as AppView)} />;
  }

  // ─── View Routing ───
  if (currentView === 'profile') {
    return (
      <ProfilePage
        profile={profile}
        onBack={navigateBack}
        onNavigate={(v) => navigateTo(v as AppView)}
        onSignOut={signOut}
        onProfileUpdated={refreshProfile}
      />
    );
  }

  if (currentView === 'privacy') {
    return <PrivacyPolicy onBack={navigateBack} />;
  }

  if (currentView === 'terms') {
    return <TermsAndConditions onBack={navigateBack} />;
  }

  // ─── Main Chat View (Sorin-AI Light Glassmorphism) ───
  return (
    <div className="app-wrapper">
      {/* Hidden universal file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        style={{ display: "none" }}
        className="hidden-file-input"
        onChange={handleFileUpload}
      />

      {/* ─── Top Navigation Bar (Sorin Style) ─── */}
      <header className="top-nav-bar">
        <div className="top-nav-left">
          <button className="brand-logo-btn" onClick={() => navigateTo('chat')}>
            <div className="brand-orb-icon">🌐</div>
            <span className="brand-title">Study-AI</span>
          </button>
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen((prev) => !prev)}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-label="Toggle sidebar"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
        </div>

        <div className="top-nav-center">
          <nav className="pill-segmented-nav">
            <button
              className={`pill-nav-item ${activeNavTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => {
                setActiveNavTab('dashboard');
                navigateTo('profile');
              }}
            >
              Dashboard
            </button>
            <button
              className={`pill-nav-item ${activeNavTab === 'chatbot' ? 'active' : ''}`}
              onClick={() => {
                setActiveNavTab('chatbot');
                navigateTo('chat');
              }}
            >
              AI Chatbot
            </button>
            <button
              className={`pill-nav-item ${activeNavTab === 'quizzes' ? 'active' : ''}`}
              onClick={() => {
                setActiveNavTab('quizzes');
                handleGenerateQuiz();
              }}
            >
              Quizzes
            </button>
            <button
              className={`pill-nav-item ${activeNavTab === 'flashcards' ? 'active' : ''}`}
              onClick={() => {
                setActiveNavTab('flashcards');
                handleGenerateFlashcards();
              }}
            >
              Flashcards
            </button>
            <button
              className={`pill-nav-item ${activeNavTab === 'help' ? 'active' : ''}`}
              onClick={() => {
                setActiveNavTab('help');
                navigateTo('privacy');
              }}
            >
              Help & Docs
            </button>
          </nav>
        </div>

        <div className="top-nav-right">
          <div
            className="top-user-pill"
            onClick={() => setShowProfileMenu((prev) => !prev)}
            title="Account Menu"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Profile"
                className="top-user-avatar"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="top-user-fallback">
                {(profile?.display_name || profile?.email || "U").charAt(0).toUpperCase()}
              </div>
            )}
            <span className="top-user-name">
              {profile?.display_name || user.email?.split("@")[0] || "User"}
            </span>
          </div>
        </div>
      </header>

      {/* ─── App Body: Sidebar + Main Canvas ─── */}
      <div className="app-body-container">
        {/* Left Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
          <div className="sidebar-content-scroll">
            <button className="new-chat-button" onClick={handleNewChat}>
              <span>✏️</span>
              <span>New Chat</span>
            </button>

            <div className="sidebar-section-title">MENU</div>
            <nav className="sidebar-nav-list">
              <button
                className="sidebar-nav-item active"
                onClick={() => navigateTo('chat')}
              >
                <span className="sidebar-nav-icon">🛡️</span>
                <span>Study Sessions</span>
              </button>
              <button
                className="sidebar-nav-item"
                onClick={handleGenerateFlashcards}
              >
                <span className="sidebar-nav-icon">⭐</span>
                <span>My Flashcards</span>
              </button>
              <button
                className="sidebar-nav-item"
                onClick={handleGenerateQuiz}
              >
                <span className="sidebar-nav-icon">🖥️</span>
                <span>Quiz Practice</span>
              </button>
              <button
                className="sidebar-nav-item"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="sidebar-nav-icon">📄</span>
                <span>My Documents</span>
              </button>
            </nav>

            <div className="sidebar-section-title">RECENT SESSIONS</div>
            <div className="conversation-list">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`conversation-card ${
                    conversation.id === activeConversationId ? "active" : ""
                  }`}
                >
                  <button
                    className="conversation-main"
                    onClick={() => {
                      setActiveConversationId(conversation.id);
                      setError(null);
                      setOpenConversationMenuId(null);
                    }}
                  >
                    <div className="conv-card-meta">
                      <span className="conv-title">{conversation.title}</span>
                      {conversation.pdfFile && (
                        <span
                          className="conv-pdf-indicator"
                          title={conversation.pdfName}
                        >
                          {getFileIcon(conversation.pdfName, conversation.pdfFile.type)}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    className="conversation-actions"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenConversationMenuId((curr) =>
                        curr === conversation.id ? null : conversation.id
                      );
                    }}
                  >
                    •••
                  </button>
                  {openConversationMenuId === conversation.id && (
                    <div className="conversation-menu">
                      <button onClick={() => handleClearConversation(conversation.id)}>
                        Clear chat
                      </button>
                      <button
                        className="danger"
                        onClick={() => handleDeleteConversation(conversation.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Profile Card */}
          <div
            className="sidebar-profile-card"
            onClick={() => setShowProfileMenu((prev) => !prev)}
          >
            <div className="profile-card-left">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Profile"
                  className="profile-avatar-img"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="profile-avatar-fallback">
                  {(profile?.display_name || profile?.email || "U").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="profile-text-col">
                <span className="profile-display-name">
                  {profile?.display_name || user.email?.split("@")[0] || "Student"}
                </span>
                <span className="profile-email-label">{user.email}</span>
              </div>
            </div>
            <span className="profile-chevron">⌄</span>

            {/* Profile Pop-up Menu */}
            {showProfileMenu && (
              <div
                className="profile-popup-menu"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="profile-popup-item"
                  onClick={() => navigateTo('profile')}
                >
                  <span>👤</span> Profile & Stats
                </button>
                <button
                  className="profile-popup-item"
                  onClick={() => navigateTo('privacy')}
                >
                  <span>🔒</span> Privacy Policy
                </button>
                <button
                  className="profile-popup-item"
                  onClick={() => navigateTo('terms')}
                >
                  <span>📜</span> Terms & Conditions
                </button>
                <button
                  className="profile-popup-item danger"
                  onClick={signOut}
                >
                  <span>🚪</span> Sign Out
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ─── Main Panel Canvas (Frosted Glass) ─── */}
        <main className="main-panel">
          {error && (
            <div className="auth-error" style={{ margin: "14px 20px 0" }}>
              <span>⚠️</span> {error}
            </div>
          )}

          <div className="chat-scroll-area" ref={chatContainerRef as any}>
            {activeConversation && activeConversation.messages.length > 0 ? (
              /* Active Chat Stream */
              <div className="chat-history">
                {activeConversation.messages.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div
                      key={message.id}
                      className={`message-row ${isUser ? "user" : "assistant"}`}
                    >
                      <div className="message-bubble-wrapper">
                        <div className="message-sender">
                          {isUser ? "You" : "Study-AI"}
                        </div>

                        <div className="message-bubble">
                          {isUser ? (
                            message.content
                          ) : (
                            <>
                              <AnimatedTextMessage
                                content={message.content}
                                animate={message.id === animatedMessageId}
                              />

                              {/* Interactive Quiz Renderer */}
                              {message.type === "quiz" && message.quizQuestions && (
                                <div className="quiz-container">
                                  {message.quizQuestions.map((q, qIndex) => {
                                    const selected = message.quizAnswers?.[qIndex];
                                    const isDone = message.quizResult !== null && message.quizResult !== undefined;

                                    return (
                                      <div key={qIndex} className="quiz-card">
                                        <div className="quiz-question-text">
                                          {qIndex + 1}. {q.question}
                                        </div>
                                        <div className="quiz-choices-grid">
                                          {q.choices.map((choice) => {
                                            const isSelected = selected === choice;
                                            const isCorrect = choice.trim().toLowerCase() === q.answer.trim().toLowerCase();
                                            let statusClass = "";
                                            if (isDone) {
                                              if (isCorrect) statusClass = "correct";
                                              else if (isSelected) statusClass = "incorrect";
                                            } else if (isSelected) {
                                              statusClass = "selected";
                                            }

                                            return (
                                              <button
                                                key={choice}
                                                disabled={isDone}
                                                className={`quiz-choice-btn ${statusClass}`}
                                                onClick={() => {
                                                  const newAnswers = { ...(message.quizAnswers || {}), [qIndex]: choice };
                                                  updateMessage(activeConversation.id, message.id, () => ({
                                                    quizAnswers: newAnswers
                                                  }));
                                                }}
                                              >
                                                {choice}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {!message.quizResult && (
                                    <button
                                      className="sorin-send-btn"
                                      style={{ alignSelf: "center", marginTop: 8 }}
                                      onClick={() => {
                                        let correctCount = 0;
                                        message.quizQuestions?.forEach((q, idx) => {
                                          const ans = message.quizAnswers?.[idx];
                                          if (ans && ans.trim().toLowerCase() === q.answer.trim().toLowerCase()) {
                                            correctCount++;
                                          }
                                        });
                                        const res = { correct: correctCount, total: message.quizQuestions?.length || 0 };
                                        updateMessage(activeConversation.id, message.id, () => ({
                                          quizResult: res
                                        }));
                                      }}
                                    >
                                      Submit Quiz Answers
                                    </button>
                                  )}

                                  {message.quizResult && (
                                    <div className="quiz-score-banner">
                                      🎉 Quiz Completed: Score {message.quizResult.correct} / {message.quizResult.total}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Interactive 3D Flashcard Deck */}
                              {message.type === "flashcards" && message.flashcards && message.flashcards.length > 0 && (
                                <div className="flashcards-container">
                                  {(() => {
                                    const currIndex = message.flashcardIndex || 0;
                                    const card = message.flashcards[currIndex];
                                    return (
                                      <>
                                        <div
                                          className="flashcard-3d-wrapper"
                                          onClick={(e) => {
                                            const inner = e.currentTarget.querySelector('.flashcard-inner');
                                            inner?.classList.toggle('flipped');
                                          }}
                                        >
                                          <div className="flashcard-inner">
                                            <div className="flashcard-front">
                                              <div className="flashcard-prompt-text">{card.front}</div>
                                              <div className="flashcard-hint">Click to flip card ↺</div>
                                            </div>
                                            <div className="flashcard-back">
                                              <div className="flashcard-prompt-text">{card.back}</div>
                                              <div className="flashcard-hint">Click to flip back ↺</div>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flashcard-nav-row">
                                          <button
                                            className="flashcard-nav-btn"
                                            disabled={currIndex === 0}
                                            onClick={() => updateMessage(activeConversation.id, message.id, () => ({
                                              flashcardIndex: Math.max(0, currIndex - 1)
                                            }))}
                                          >
                                            ◀ Prev
                                          </button>
                                          <span className="flashcard-counter">
                                            {currIndex + 1} / {message.flashcards.length}
                                          </span>
                                          <button
                                            className="flashcard-nav-btn"
                                            disabled={currIndex === message.flashcards.length - 1}
                                            onClick={() => updateMessage(activeConversation.id, message.id, () => ({
                                              flashcardIndex: Math.min(message.flashcards!.length - 1, currIndex + 1)
                                            }))}
                                          >
                                            Next ▶
                                          </button>
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isActiveConversationLoading && (
                  <div className="message-row assistant">
                    <div className="message-bubble-wrapper">
                      <div className="message-sender">Study-AI</div>
                      <div className="message-bubble">
                        <div className="typing-indicator">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>
            ) : (
              /* ─── Sorin-AI Welcome & Hero State ─── */
              <div className="sorin-hero-container">
                {/* Concentric Pulsating Orb */}
                <div className="concentric-orb-wrapper">
                  <div className="orb-ring-outer">
                    <div className="orb-ring-middle">
                      <div className="orb-core">🌐</div>
                    </div>
                  </div>
                </div>

                {/* Greeting */}
                <h1 className="sorin-hero-title">
                  Hey, I'm <span className="highlight-mint">StudyAI</span>. How can I help you today?
                </h1>

                {/* Quick Action Pills */}
                <div className="action-pills-row">
                  <button className="action-pill-btn" onClick={handleGenerateSummary}>
                    <span>📑</span> Summarize Notes
                  </button>
                  <button className="action-pill-btn" onClick={handleGenerateQuiz}>
                    <span>📝</span> Generate Quiz
                  </button>
                  <button className="action-pill-btn" onClick={handleGenerateFlashcards}>
                    <span>🗂️</span> Flashcards
                  </button>
                  <button className="action-pill-btn" onClick={() => fileInputRef.current?.click()}>
                    <span>🖼️</span> Photo / Diagram
                  </button>
                  <button className="action-pill-btn" onClick={() => handleQuickPrompt("Explain the core concepts in detail")}>
                    <span>🔍</span> Deep Explain
                  </button>
                  <button className="action-pill-btn" onClick={() => handleQuickPrompt("Extract all key formulas, terms, and data points")}>
                    <span>📊</span> Key Data
                  </button>
                </div>

                {/* Floating Sorin Input Card in Center */}
                <div className="floating-input-container">
                  <div
                    className={`sorin-input-card ${isDragging ? "dragging" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileSelected(file);
                    }}
                  >
                    <div className="sorin-input-top-row">
                      <textarea
                        className="sorin-textarea"
                        rows={1}
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder="Research documents, summarize notes, generate quizzes and flashcards..."
                      />
                    </div>

                    {/* Attached File Preview inside card */}
                    {activeConversation?.pdfFile && (
                      <div className="input-attached-badge">
                        {activeConversation.previewUrl ? (
                          <img
                            src={activeConversation.previewUrl}
                            alt="preview"
                            className="input-attached-thumb"
                          />
                        ) : (
                          <span>{getFileIcon(activeConversation.pdfName, activeConversation.pdfFile.type)}</span>
                        )}
                        <span className="input-attached-name">{activeConversation.pdfName}</span>
                        <span className="input-attached-size">{formatFileSize(activeConversation.pdfFile.size)}</span>
                        <button className="input-attached-remove" onClick={handleRemoveFile} title="Remove file">
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Bottom Toolbar inside Card */}
                    <div className="sorin-input-bottom-row">
                      <div className="sorin-bottom-left">
                        <button
                          className="small-icon-btn"
                          title="Attach document or photo"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          📎
                        </button>
                      </div>

                      <button
                        className="sorin-send-btn"
                        onClick={handleSendMessage}
                        disabled={isActiveConversationLoading || !inputMessage.trim()}
                      >
                        <span>Send</span>
                        <span>↑</span>
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Bottom Docked Input when Chatting */}
          {activeConversation && activeConversation.messages.length > 0 && (
            <div className="chat-dock-footer">
              <div className="floating-input-container">
                <div
                  className={`sorin-input-card ${isDragging ? "dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleFileSelected(file);
                  }}
                >
                  <div className="sorin-input-top-row">
                    <textarea
                      className="sorin-textarea"
                      rows={1}
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Ask questions about your documents, notes, or photos..."
                    />
                  </div>

                  {activeConversation.pdfFile && (
                    <div className="input-attached-badge">
                      {activeConversation.previewUrl ? (
                        <img
                          src={activeConversation.previewUrl}
                          alt="preview"
                          className="input-attached-thumb"
                        />
                      ) : (
                        <span>{getFileIcon(activeConversation.pdfName, activeConversation.pdfFile.type)}</span>
                      )}
                      <span className="input-attached-name">{activeConversation.pdfName}</span>
                      <span className="input-attached-size">{formatFileSize(activeConversation.pdfFile.size)}</span>
                      <button className="input-attached-remove" onClick={handleRemoveFile} title="Remove file">
                        ✕
                      </button>
                    </div>
                  )}

                  <div className="sorin-input-bottom-row">
                    <div className="sorin-bottom-left">
                      <button
                        className="small-icon-btn"
                        title="Attach document or photo"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        📎
                      </button>
                    </div>

                    <button
                      className="sorin-send-btn"
                      onClick={handleSendMessage}
                      disabled={isActiveConversationLoading || !inputMessage.trim()}
                    >
                      <span>Send</span>
                      <span>↑</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
