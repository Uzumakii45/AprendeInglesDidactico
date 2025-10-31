import React, { useState, useMemo, useEffect, useReducer } from 'react';
import { GameLevel, LevelType } from '../types';
import { GoogleGenAI } from '@google/genai';

const gameLevels: GameLevel[] = [
  { id: 1, type: LevelType.Scramble, word: 'APPLE', scrambled: 'PAPEL', hint: 'A common fruit, often red or green.' },
  { id: 2, type: LevelType.Scramble, word: 'HOUSE', scrambled: 'ESUHO', hint: 'A building where people live.' },
  { id: 3, type: LevelType.Scramble, word: 'WATER', scrambled: 'RAWET', hint: 'A clear liquid you drink.' },
  { id: 4, type: LevelType.Scramble, word: 'COMPUTER', scrambled: 'PMUORCET', hint: 'An electronic device for storing and processing data.' },
  { id: 5, type: LevelType.Scramble, word: 'LANGUAGE', scrambled: 'GGEAALUN', hint: 'The method of human communication.' },
  { id: 6, type: LevelType.CompleteSentence, sentenceParts: ['She ___ to the store.', ''], answer: 'went', hint: 'Past tense of "go".' },
  { id: 7, type: LevelType.CompleteSentence, sentenceParts: ['The sky is ___.', ''], answer: 'blue', hint: 'A primary color.' },
  { id: 8, type: LevelType.CompleteSentence, sentenceParts: ['I have ___ brothers.', ''], answer: 'two', hint: 'The number after one.' },
  { id: 9, type: LevelType.CompleteSentence, sentenceParts: ['Birds can ___.', ''], answer: 'fly', hint: 'What birds do in the air.' },
  { id: 10, type: LevelType.CompleteSentence, sentenceParts: ['Please close the ___.', ''], answer: 'door', hint: 'You walk through it to enter a room.' },
];

const LIFE_COST = 200;
const POINTS_PER_LEVEL = 100;

interface GameState {
    levelIndex: number;
    score: number;
    lives: number;
}

type GameAction =
  | { type: 'CORRECT_ANSWER' }
  | { type: 'INCORRECT_ANSWER' }
  | { type: 'NEXT_LEVEL' }
  | { type: 'BUY_LIFE' }
  | { type: 'RESET' }
  | { type: 'LOAD_STATE'; payload: GameState };

const initialState: GameState = { levelIndex: 0, score: 0, lives: 3 };

function gameReducer(state: GameState, action: GameAction): GameState {
    switch (action.type) {
        case 'CORRECT_ANSWER':
            return { ...state, score: state.score + POINTS_PER_LEVEL };
        case 'INCORRECT_ANSWER':
            return { ...state, lives: Math.max(0, state.lives - 1) };
        case 'NEXT_LEVEL':
            return { ...state, levelIndex: state.levelIndex + 1 };
        case 'BUY_LIFE':
            if (state.score >= LIFE_COST && state.lives < 3) {
                return { ...state, score: state.score - LIFE_COST, lives: state.lives + 1 };
            }
            return state;
        case 'RESET':
            return initialState;
        case 'LOAD_STATE':
            return action.payload;
        default:
            return state;
    }
}

const EnglishLearningGame: React.FC = () => {
    const [gameState, dispatch] = useReducer(gameReducer, initialState);
    const [currentAnswer, setCurrentAnswer] = useState('');
    const [feedback, setFeedback] = useState<{ message: string; type: 'correct' | 'incorrect' | 'info' } | null>(null);
    const [showHint, setShowHint] = useState(false);
    const [isLevelComplete, setIsLevelComplete] = useState(false);
    
    const [isLearning, setIsLearning] = useState(false);
    const [learningContent, setLearningContent] = useState('');
    const [isGeminiLoading, setIsGeminiLoading] = useState(false);

    const { levelIndex, score, lives } = gameState;
    const currentLevel = gameLevels[levelIndex];

    useEffect(() => {
        try {
            const savedState = localStorage.getItem('englishGameState');
            if (savedState) {
                const parsedState = JSON.parse(savedState);
                if (parsedState.levelIndex < gameLevels.length) {
                    dispatch({ type: 'LOAD_STATE', payload: JSON.parse(savedState) });
                }
            }
        } catch (error) {
            console.error("Failed to load game state from localStorage", error);
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('englishGameState', JSON.stringify(gameState));
        } catch (error) {
            console.error("Failed to save game state to localStorage", error);
        }
    }, [gameState]);
    
    const resetLevelState = () => {
        setCurrentAnswer('');
        setFeedback(null);
        setShowHint(false);
        setIsLevelComplete(false);
    };

    const handleNextLevel = () => {
        if (levelIndex < gameLevels.length - 1) {
            dispatch({ type: 'NEXT_LEVEL' });
            resetLevelState();
        } else {
            setFeedback({ message: 'Congratulations! You have completed all levels!', type: 'info' });
        }
    };
    
    const handleSubmit = () => {
        let isCorrect = false;
        if (currentLevel.type === LevelType.Scramble) {
            isCorrect = currentAnswer.toUpperCase() === currentLevel.word.toUpperCase();
        } else if (currentLevel.type === LevelType.CompleteSentence) {
            isCorrect = currentAnswer.trim().toLowerCase() === currentLevel.answer.toLowerCase();
        }

        if (isCorrect) {
            setFeedback({ message: 'Correct! Well done!', type: 'correct' });
            dispatch({ type: 'CORRECT_ANSWER' });
            setIsLevelComplete(true);
        } else {
            setFeedback({ message: 'Not quite, try again!', type: 'incorrect' });
            dispatch({ type: 'INCORRECT_ANSWER' });
            if (lives - 1 <= 0) {
                setFeedback({ message: 'Game Over! Restarting...', type: 'incorrect' });
                setTimeout(() => {
                    dispatch({ type: 'RESET' });
                    resetLevelState();
                }, 2000);
            }
        }
    };

    const handleLearnWithGemini = async () => {
        const term = currentLevel.type === LevelType.Scramble ? currentLevel.word : currentLevel.answer;
        setIsLearning(true);
        setIsGeminiLoading(true);
        setLearningContent('');

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            const prompt = `You are a helpful English learning assistant. The user has just learned the word "${term}". Provide a simple, clear explanation for an English learner. Include:\n1. A simple definition in English.\n2. The translation in Spanish.\n3. Two example sentences in English that are easy to understand. Format your response clearly with headings.`;
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt
            });
            setLearningContent(response.text);
        } catch (error) {
            console.error("Gemini API error:", error);
            setLearningContent('Sorry, I couldn\'t fetch the learning content right now. Please try again later.');
        } finally {
            setIsGeminiLoading(false);
        }
    };

    const renderLevelContent = () => {
        if (!currentLevel) return null;

        if (currentLevel.type === LevelType.Scramble) {
            const scrambledLetters = currentLevel.scrambled.split('').map((letter, index) => ({ letter, id: `${letter}-${index}` }));
            return (
                <>
                    <div className="min-h-[60px] bg-gray-700 rounded-md flex items-center justify-center p-4 mb-4 tracking-[0.5em] text-3xl font-bold text-white">
                        {currentAnswer}
                    </div>
                    <div className="flex justify-center flex-wrap gap-3 mb-4 min-h-[50px]">
                        {scrambledLetters.map(({ letter, id }) => (
                            <button key={id} onClick={() => setCurrentAnswer(prev => prev + letter)} className="w-12 h-12 bg-primary-600 text-white font-bold text-2xl rounded-md hover:bg-primary-500 transition transform hover:scale-110" disabled={isLevelComplete}>
                                {letter}
                            </button>
                        ))}
                    </div>
                </>
            );
        }

        if (currentLevel.type === LevelType.CompleteSentence) {
            return (
                <div className="flex items-center justify-center text-xl md:text-2xl space-x-2">
                    <span>{currentLevel.sentenceParts[0]}</span>
                    <input
                        type="text"
                        value={currentAnswer}
                        onChange={(e) => setCurrentAnswer(e.target.value)}
                        className="w-24 md:w-32 bg-gray-700 border-2 border-primary-500 rounded text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary-400"
                        disabled={isLevelComplete}
                    />
                    <span>{currentLevel.sentenceParts[1]}</span>
                </div>
            );
        }
    };

    const renderControls = () => {
        if (isLevelComplete) {
            return (
                <div className="flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-4">
                    <button onClick={handleLearnWithGemini} className="px-6 py-2 bg-purple-600 rounded-md font-semibold hover:bg-purple-500 transition">Learn with Gemini</button>
                    <button onClick={handleNextLevel} className="px-6 py-2 bg-green-600 rounded-md font-semibold hover:bg-green-500 transition">
                        {levelIndex < gameLevels.length - 1 ? 'Next Level' : 'Finish Game'}
                    </button>
                </div>
            );
        }
        return (
            <div className="flex justify-center space-x-4">
                <button onClick={handleSubmit} className="px-6 py-2 bg-green-600 rounded-md font-semibold hover:bg-green-500 transition">Submit</button>
                <button onClick={() => setCurrentAnswer('')} className="px-6 py-2 bg-red-600 rounded-md font-semibold hover:bg-red-500 transition">Clear</button>
                <button onClick={() => setShowHint(!showHint)} className="px-6 py-2 bg-yellow-600 rounded-md font-semibold hover:bg-yellow-500 transition">Hint</button>
            </div>
        );
    };

    if (!currentLevel) {
        return (
            <div className="text-center">
                 <h2 className="text-3xl font-bold text-green-400 mb-4">Congratulations!</h2>
                 <p className="text-lg text-gray-300 mb-6">You've completed all the levels. Your final score is {score}.</p>
                 <button onClick={() => { dispatch({ type: 'RESET' }); resetLevelState(); }} className="px-8 py-3 bg-primary-600 rounded-md font-semibold hover:bg-primary-500 transition text-lg">
                    Play Again
                 </button>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center text-center">
             <h2 className="text-3xl font-bold mb-2 text-primary-400">
                {currentLevel.type === LevelType.Scramble ? 'Word Scramble' : 'Complete the Sentence'}
            </h2>
            <p className="text-gray-400 mb-4">Unscramble the letters or fill in the blank to form the correct English word.</p>
            <div className="w-full max-w-lg mb-4">
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                    <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${((levelIndex) / gameLevels.length) * 100}%` }}></div>
                </div>
                <p className="text-sm text-gray-400 mt-1">Level {levelIndex + 1} of {gameLevels.length}</p>
            </div>


            <div className="w-full max-w-lg bg-gray-900 p-6 rounded-lg shadow-inner mb-6">
                <div className="flex justify-between items-center mb-4 text-lg">
                    <span className="font-semibold text-primary-300">Score: {score}</span>
                    <div className="flex items-center">
                        <span className="mr-2 font-semibold text-red-400">Lives:</span>
                        <div className="flex space-x-1">
                            {Array.from({ length: 3 }).map((_, i) => <span key={i} className={`text-2xl ${i < lives ? 'text-red-500' : 'text-gray-600'}`}>♥</span>)}
                        </div>
                    </div>
                </div>

                <div className="min-h-[80px] flex items-center justify-center mb-6">
                    {renderLevelContent()}
                </div>
                
                {showHint && !isLevelComplete && (
                    <div className="p-3 bg-yellow-900/50 text-yellow-300 rounded-md my-4 transition-opacity duration-300">
                        <strong>Hint:</strong> {currentLevel.hint}
                    </div>
                )}
                
                {renderControls()}
            </div>
            
            <div className="flex items-center space-x-4">
                {feedback && (
                    <div className={`px-6 py-3 rounded-lg font-medium ${
                        feedback.type === 'correct' ? 'bg-green-500/20 text-green-300' :
                        feedback.type === 'incorrect' ? 'bg-red-500/20 text-red-300' :
                        'bg-blue-500/20 text-blue-300'
                    }`}>
                        {feedback.message}
                    </div>
                )}
                 <button onClick={() => dispatch({ type: 'BUY_LIFE' })} disabled={score < LIFE_COST || lives >= 3} className="px-4 py-2 bg-blue-600 text-sm rounded-md font-semibold hover:bg-blue-500 transition disabled:bg-gray-600 disabled:cursor-not-allowed">
                    Buy Life ({LIFE_COST} pts)
                </button>
            </div>
           
            {isLearning && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setIsLearning(false)}>
                    <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-2xl font-bold text-primary-400 mb-4">Learn with Gemini</h3>
                        {isGeminiLoading ? (
                            <div className="flex justify-center items-center h-48">
                                <div className="loader border-t-4 border-primary-500 rounded-full w-12 h-12 animate-spin"></div>
                            </div>
                        ) : (
                            <div className="prose prose-invert text-left whitespace-pre-wrap">{learningContent}</div>
                        )}
                        <button onClick={() => setIsLearning(false)} className="mt-6 w-full py-2 bg-primary-600 rounded-md font-semibold hover:bg-primary-500 transition">Close</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EnglishLearningGame;
