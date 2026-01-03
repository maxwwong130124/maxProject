import html from '/static/js/utils/html.js';
import IntroSequence from '/static/js/components/IntroSequence.js';
import Login from '/static/js/components/Login.js';
import ChatInterface from '/static/js/components/ChatInterface.js';
import { importPrivateKeyFromStorage } from '/static/js/utils/crypto.js';

const { useState, useEffect } = React;
const root = ReactDOM.createRoot(document.getElementById('root'));

function App() {
    // --- CHECK SKIP FLAG ---
    const shouldSkip = sessionStorage.getItem('skipIntro') === 'true';
    
    // Initialize loading state based on flag
    const [isLoading, setIsLoading] = useState(!shouldSkip);
    const [userSession, setUserSession] = useState(null);

    useEffect(() => {
        if (shouldSkip) {
            sessionStorage.removeItem('skipIntro');
        }

        const checkSession = async () => {
            const storedUser = localStorage.getItem('hermes_username');
            const storedKey = localStorage.getItem('hermes_key');

            if (storedUser && storedKey) {
                try {
                    const privateKey = await importPrivateKeyFromStorage(storedKey);
                    setUserSession({
                        username: storedUser,
                        keyPair: { privateKey: privateKey } 
                    });
                } catch (e) {
                    console.error("Session restore failed:", e);
                    localStorage.clear();
                }
            }
        };
        checkSession();
    }, []);

    // --- NEW: LOGOUT HANDLER ---
    const handleLogout = () => {
        // 1. Clear all storage to prevent auto-login or key leaks
        localStorage.removeItem('hermes_username');
        localStorage.removeItem('hermes_key');
        sessionStorage.clear();
        
        // 2. Reset Session State -> This switches view to <Login>
        setUserSession(null);
        
        // 3. Ensure Loading is false so Intro doesn't play
        setIsLoading(false);
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
        : html`<${Login} onLogin=${(u, k) => setUserSession({username: u, keyPair: k})} />`;
}

root.render(html`<${App} />`);