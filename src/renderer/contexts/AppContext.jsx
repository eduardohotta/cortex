import React, { createContext, useContext, useReducer, useEffect } from 'react';

// Initial State
const initialState = {
    isListening: false,
    transcript: [], // { text: string, isFinal: boolean }
    tokenCount: 0,
    activeView: 'transcript',
    assistants: [],
    currentAssistantId: 'default',
    audioLevel: 0,
    audioDevices: { input: [], output: [], loopback: [] }, // New
    settings: {}, // Global raw settings
    panicMode: false
};

// Actions
export const ACTIONS = {
    SET_LISTENING: 'SET_LISTENING',
    UPDATE_TRANSCRIPT: 'UPDATE_TRANSCRIPT',
    SET_AUDIO_LEVEL: 'SET_AUDIO_LEVEL',
    SET_VIEW: 'SET_VIEW',
    SET_ASSISTANTS: 'SET_ASSISTANTS',
    SET_ACTIVE_ASSISTANT: 'SET_ACTIVE_ASSISTANT',
    SET_TOKENS: 'SET_TOKENS',
    PANIC: 'PANIC'
};

// Reducer
function appReducer(state, action) {
    switch (action.type) {
        case ACTIONS.SET_LISTENING:
            return { ...state, isListening: action.payload };
        case ACTIONS.UPDATE_TRANSCRIPT:
            const { text, isFinal } = action.payload;
            // Append logic here or handle in component? 
            // Ideally state holds the source of truth.
            // If final, push to history. If interim, update current buffer.
            // Simplify for now: payload is the specific update event data.
            return { ...state, lastTranscript: action.payload };
        case ACTIONS.SET_AUDIO_LEVEL:
            return { ...state, audioLevel: action.payload };
        case ACTIONS.SET_VIEW:
            return { ...state, activeView: action.payload };
        case ACTIONS.SET_ASSISTANTS:
            return { ...state, assistants: action.payload };
        case ACTIONS.SET_ACTIVE_ASSISTANT:
            return { ...state, currentAssistantId: action.payload };
        case ACTIONS.SET_TOKENS:
            return { ...state, tokenCount: action.payload };
        case ACTIONS.PANIC:
            return { ...initialState, panicMode: true };
        default:
            return state;
    }
}

const AppContext = createContext();

export function AppProvider({ children }) {
    const [state, dispatch] = useReducer(appReducer, initialState);

    // Connect to Electron IPC
    useEffect(() => {
        if (!window.electronAPI) return;

        try {
            const removeAudioListener = window.electronAPI.audio?.onVolume?.((level) => {
                dispatch({ type: ACTIONS.SET_AUDIO_LEVEL, payload: level });
            });

            const removeTranscriptListener = window.electronAPI.transcription?.onTranscript?.((data) => {
                dispatch({ type: ACTIONS.UPDATE_TRANSCRIPT, payload: data });
            });

            const removeAskListener = window.electronAPI.app?.onHotkeyAsk?.(() => {
                // Trigger the same logic as the "Perguntar" button
                window.electronAPI.llm?.processAsk?.({ text: null, manual: true });
                // Switch view automatically if on overlay
                dispatch({ type: ACTIONS.SET_VIEW, payload: 'response' });
            });

            const removeStateListener = window.electronAPI.app?.onStateUpdate?.((newState) => {
                if (newState.isListening !== undefined) {
                    dispatch({ type: ACTIONS.SET_LISTENING, payload: newState.isListening });
                }
                if (newState.tokenCount !== undefined) {
                    dispatch({ type: ACTIONS.SET_TOKENS, payload: newState.tokenCount });
                }
            });

            // Initial Load
            window.electronAPI.settings?.getProfiles?.().then(profiles => {
                if (profiles) dispatch({ type: ACTIONS.SET_ASSISTANTS, payload: profiles });
            }).catch(err => console.error("Failed to load profiles:", err));

        } catch (error) {
            console.error("AppContext IPC Error:", error);
        }

        return () => {
            // Cleanup listeners if possible
        };
    }, []);

    return (
        <AppContext.Provider value={{ state, dispatch }}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    return useContext(AppContext);
}
