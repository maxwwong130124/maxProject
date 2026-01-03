import html from '../utils/html.js';
import { API_URL } from '../utils/config.js';
import { generateKeyPair, exportKey } from '../utils/crypto.js';

const { useState } = React;

export default function Login({ onLogin }) {
    const [isRegistering, setIsRegistering] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(false);
    const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');

    React.useEffect(() => {
        if (isDark) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light');
        }
    }, [isDark]);

    const handleSubmit = async () => {
        if(!username || !password) return;
        setLoading(true);
        setStatus("> GENERATING KEYS...");
        try {
            const keyPair = await generateKeyPair();
            const pubPem = await exportKey(keyPair.publicKey, "spki");
            const endpoint = isRegistering ? "/register" : "/login";
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, public_key: pubPem })
            });
            if (!res.ok) {
                try { const err = await res.json(); throw new Error(err.detail); } 
                catch (e) { throw new Error(`ERROR ${res.status}`); }
            }
            onLogin(username, keyPair);
        } catch (e) { setStatus(`> ${e.message}`); }
        setLoading(false);
    };

    return html`
        <div className="flex h-screen items-center justify-center relative transition-colors duration-300">
            
            <!-- THEME TOGGLE BUTTON (TOP RIGHT) -->
            <div className="absolute top-4 right-4">
                <button onClick=${() => setIsDark(!isDark)} className="btn-pixel text-xs flex items-center gap-2">
                    <i className=${`fas ${isDark ? 'fa-sun' : 'fa-moon'}`}></i>
                    ${isDark ? "LIGHT" : "DARK"}
                </button>
            </div>

            <!-- LOGIN BOX -->
            <div className="pixel-box p-8 w-96 flex flex-col items-center">
                
                <h1 className="text-3xl mb-6 text-center" style=${{ fontFamily: '"Press Start 2P"' }}>
                    LOGIN
                </h1>

                <div className="w-full space-y-6 mb-8">
                    <div>
                        <label className="block font-bold text-sm mb-2">> USERNAME:</label>
                        <input className="w-full input-pixel" 
                               value=${username} onChange=${e => setUsername(e.target.value)} />
                    </div>
                    <div>
                        <label className="block font-bold text-sm mb-2">> PASSWORD:</label>
                        <input type="password" className="w-full input-pixel" 
                               value=${password} onChange=${e => setPassword(e.target.value)} onKeyPress=${e => e.key === 'Enter' && handleSubmit()} />
                    </div>
                </div>

                <button onClick=${handleSubmit} disabled=${loading} className="w-full btn-pixel mb-4">
                    ${loading ? "PROCESSING..." : (isRegistering ? "REGISTER NEW USER" : "ENTER SYSTEM")}
                </button>

                <p className="text-center text-red-600 font-bold text-sm min-h-[1rem] font-mono">${status}</p>

                <button onClick=${() => { setIsRegistering(!isRegistering); setStatus(""); }} className="mt-4 hover:opacity-50 underline text-sm font-mono cursor-pointer bg-transparent border-none" style=${{ color: isDark ? '#fff' : '#000' }}>
                    ${isRegistering ? "<< BACK TO LOGIN" : "CREATE ACCOUNT >>"}
                </button>
            </div>
        </div>
    `;
}