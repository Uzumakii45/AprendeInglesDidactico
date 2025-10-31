
import React, { useState, useMemo } from 'react';
import { Tab } from './types';
import EnglishLearningGame from './components/EnglishLearningGame';
import ImageEditor from './components/ImageEditor';
import LiveConversation from './components/LiveConversation';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.Game);

  const apiKey = useMemo(() => process.env.API_KEY, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case Tab.Game:
        return <EnglishLearningGame />;
      case Tab.ImageEditor:
        return <ImageEditor />;
      case Tab.LiveChat:
        return <LiveConversation />;
      default:
        return null;
    }
  };

  if (!apiKey) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-2xl text-center bg-gray-800 p-8 rounded-lg shadow-2xl">
          <h1 className="text-4xl font-bold text-red-500 mb-4">Configuration Error</h1>
          <p className="text-lg text-gray-300">
            Gemini API key is not configured. Please set the `API_KEY` environment variable to use this application.
          </p>
        </div>
      </div>
    );
  }

  const TabButton: React.FC<{ tab: Tab; label: string }> = ({ tab, label }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-sm md:text-base font-medium rounded-md transition-all duration-300 ${
        activeTab === tab
          ? 'bg-primary-600 text-white shadow-lg'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      <div className="container mx-auto p-4 max-w-5xl">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-purple-500">
            Gemini Multi-Tool Suite
          </h1>
          <p className="text-gray-400 mt-2 text-lg">
            Explore the power of Gemini: Learn, Create, and Converse.
          </p>
        </header>

        <nav className="flex justify-center space-x-2 md:space-x-4 mb-8 p-2 bg-gray-800 rounded-lg shadow-md">
          <TabButton tab={Tab.Game} label="English Game" />
          <TabButton tab={Tab.ImageEditor} label="Image Editor" />
          <TabButton tab={Tab.LiveChat} label="Live Conversation" />
        </nav>

        <main className="bg-gray-800 p-4 sm:p-6 md:p-8 rounded-xl shadow-2xl min-h-[60vh]">
          {renderTabContent()}
        </main>
        
        <footer className="text-center mt-8 text-gray-500 text-sm">
          <p>Powered by Google Gemini</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
