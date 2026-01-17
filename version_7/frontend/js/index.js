import html from '/static/js/utils/html.js';
import IntroSequence from '/static/js/components/IntroSequence.js';
import Login from '/static/js/components/Login.js';
import ChatInterface from '/static/js/components/ChatInterface.js';
import { importPrivateKeyFromStorage, exportPrivateKeyToStorage } from '/static/js/utils/crypto.js';

const { useState, useEffect } = React;
const root = ReactDOM.createRoot(document.getElementById('root'));

function App() {
    // Check if we should play the intro (only plays once per session)
    const shouldSkip = sessionStorage.getItem('skipIntro') === 'true';
    
    const [isLoading, setIsLoading] = useState(!shouldSkip);
    const [userSession, setUserSession] = useState(null);

    // --- 1. CHECK FOR SAVED USER ON LOAD ---
    useEffect(() => {
        if (shouldSkip) sessionStorage.removeItem('skipIntro');

        const restoreSession = async () => {
            // Check LocalStorage (Persistent)
            const storedUser = localStorage.getItem('hermes_username');
            const storedKey = localStorage.getItem('hermes_key');

            if (storedUser && storedKey) {
                try {
                    const privateKey = await importPrivateKeyFromStorage(storedKey);
                    setUserSession({
                        username: storedUser,
                        keyPair: { privateKey: privateKey } // We only need private key for session
                    });
                    // Skip intro if we auto-login
                    setIsLoading(false);
                } catch (e) {
                    console.error("Session corrupted:", e);
                    localStorage.clear();
                }
            }
        };
        restoreSession();
    }, []);

    // --- 2. HANDLE LOGIN (Save to Storage) ---
    const handleLogin = async (username, keyPair) => {
        try {
            // Export Private Key to String
            const keyString = await exportPrivateKeyToStorage(keyPair.privateKey);
            
            // Save to LocalStorage (Persistent)
            localStorage.setItem('hermes_username', username);
            localStorage.setItem('hermes_key', keyString);
            
            // Set State
            setUserSession({ username, keyPair });
        } catch (e) {
            alert("Crypto Save Failed: " + e.message);
        }
    };

    // --- 3. HANDLE LOGOUT (Wipe Storage) ---
    const handleLogout = () => {
        localStorage.removeItem('hermes_username');
        localStorage.removeItem('hermes_key');
        sessionStorage.clear();
        setUserSession(null);
        setIsLoading(false); // Don't replay intro on logout
    };

    if (isLoading) {
        return html`<${IntroSequence} onComplete=${() => setIsLoading(false)} />`;
    }

    return userSession 
        ? html`<${ChatInterface} 
                username=${userSession.username} 
                keyPair=${userSession.keyPair} 
                onLogout=${handleLogout} 
             />`
        : html`<${Login} onLogin=${handleLogin} />`;
}

root.render(html`<${App} />`);