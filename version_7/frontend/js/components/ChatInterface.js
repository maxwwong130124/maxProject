import html from '../utils/html.js';
import { API_URL, WS_URL } from '../utils/config.js';
import { encryptMessage, decryptMessage } from '../utils/crypto.js';
import RockPaperScissors from './RockPaperScissors.js';
import Pong from './Pong.js';
import Sudoku from './Sudoku.js'; 

const { useState, useEffect, useRef } = React;

// --- [MANUAL SYSTEM CONFIGURATION] ---
// Change these booleans manually before your demo steps
const SANITIZE_HTML_ENABLED = false;   // TRUE = Secure | FALSE = Vulnerable to XSS
const REPLAY_PROTECTION_ENABLED = false; // TRUE = Secure | FALSE = Vulnerable to Replay
// -------------------------------------

export default function ChatInterface({ username, keyPair, onLogout }) {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [messages, setMessages] = useState({});
    const [input, setInput] = useState("");
    const [showDebug, setShowDebug] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [typingUser, setTypingUser] = useState(null); 
    const typingTimeout = useRef(null);
    const [encryptionEnabled, setEncryptionEnabled] = useState(true);
    const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
    
    // --- GAME STATES ---
    const [activeGame, setActiveGame] = useState(null);
    const [gameStatus, setGameStatus] = useState(null);
    const [gameSignal, setGameSignal] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [incomingInvite, setIncomingInvite] = useState(null);

    // --- REFS ---
    const selectedUserRef = useRef(null);
    const activeGameRef = useRef(null); 
    const ws = useRef(null);
    const messagesEndRef = useRef(null);
    const heartbeatRef = useRef(null);
    const seenMessages = useRef(new Set());

    useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);
    useEffect(() => { activeGameRef.current = activeGame; }, [activeGame]);

    useEffect(() => {
        if (isDark) { document.body.classList.add('dark-mode'); localStorage.setItem('theme', 'dark'); } 
        else { document.body.classList.remove('dark-mode'); localStorage.setItem('theme', 'light'); }
    }, [isDark]);

    const handleLogout = () => { if (ws.current) ws.current.close(); if (onLogout) onLogout(); };
    const handlePanic = () => { if(confirm("⚠ WARNING: KILL SWITCH WILL WIPE MEMORY. PROCEED?")) handleLogout(); };

    // --- REFRESH BUTTON LOGIC ---
    const requestList = () => {
        console.log("Requesting updated user list...");
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: "request_user_list" }));
        }
    };

    // --- GAME LOGIC ---
    const initGame = (type) => {
        if (type === 'sudoku') { setActiveGame('sudoku'); setGameStatus('playing'); return; }
        if (!selectedUser) return;
        setActiveGame(type); setGameStatus('waiting'); setIsHost(true);
        ws.current.send(JSON.stringify({ type: "game_signal", gameType: type, action: "invite", to: selectedUser }));
    };

    const cancelGame = () => {
        if (selectedUser && gameStatus === 'waiting') {
            ws.current.send(JSON.stringify({ type: "game_signal", action: "cancel", to: selectedUser }));
        }
        setActiveGame(null); setGameStatus(null); setIsHost(false); setIncomingInvite(null);
    };

    const acceptInvite = () => {
        if (!incomingInvite) return;
        setSelectedUser(incomingInvite.from); setActiveGame(incomingInvite.gameType); setGameStatus('playing'); setIsHost(false); setIncomingInvite(null);
        ws.current.send(JSON.stringify({ type: "game_signal", gameType: incomingInvite.gameType, action: "accept", to: incomingInvite.from }));
    };

    const rejectInvite = () => {
        if (incomingInvite) {
            ws.current.send(JSON.stringify({ type: "game_signal", action: "reject", to: incomingInvite.from }));
            setIncomingInvite(null);
        }
    };

    // --- WEBSOCKET ---
    useEffect(() => {
        const connect = () => {
            if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) return;
            ws.current = new WebSocket(`${WS_URL}/${username}`);

            ws.current.onopen = () => {
                setIsConnected(true);
                requestList(); // Initial request
                if (heartbeatRef.current) clearInterval(heartbeatRef.current);
                heartbeatRef.current = setInterval(() => {
                    if (ws.current && ws.current.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: "ping" }));
                }, 5000);
            };

            ws.current.onclose = () => {
                setIsConnected(false);
                if (heartbeatRef.current) clearInterval(heartbeatRef.current);
                setTimeout(connect, 2000);
            };

            ws.current.onmessage = async (event) => {
                const data = JSON.parse(event.data);

                // --- REPLAY PROTECTION LOGIC ---
                if (data.msg_id && REPLAY_PROTECTION_ENABLED) {
                    if (seenMessages.current.has(data.msg_id)) {
                        console.warn("REPLAY BLOCKED: Duplicate msg_id detected.");
                        return; 
                    }
                    seenMessages.current.add(data.msg_id);
                }
                
                if (data.type === "user_list") { 
                    setUsers(data.users.filter(u => u !== username)); 
                }
                else if (data.type === "user_left") {
                    if (activeGameRef.current && selectedUserRef.current === data.username) {
                        setActiveGame(null); setGameStatus(null); setIncomingInvite(null);
                        alert("Opponent disconnected.");
                    }
                }
                else if (data.type === "game_signal") {
                    if (data.action === "invite") { if(activeGameRef.current) return; setIncomingInvite({ from: data.from, gameType: data.gameType }); }
                    else if (data.action === "accept") { if (activeGameRef.current === data.gameType) setGameStatus('playing'); }
                    else if (data.action === "reject" || data.action === "cancel") {
                        if (data.from === selectedUserRef.current) { setActiveGame(null); setGameStatus(null); setIncomingInvite(null); alert("Game session ended."); }
                    }
                    else if (data.from === selectedUserRef.current) setGameSignal(data);
                }
                else if (data.type === "typing_signal") {
                    if (data.from === selectedUserRef.current) {
                        setTypingUser(data.from);
                        if (typingTimeout.current) clearTimeout(typingTimeout.current);
                        typingTimeout.current = setTimeout(() => setTypingUser(null), 2000);
                    }
                }
                else if (data.ciphertext) {
                    // Pass the static booleans to the decryptor
                    const decryptedText = await decryptMessage(data, keyPair.privateKey, { 
                        replayProtection: REPLAY_PROTECTION_ENABLED 
                    });
                    addMessage(data.from, { from: 'them', text: decryptedText, raw: data, time: new Date(), secure: true });
                }
                else if (data.plaintext) {
                    addMessage(data.from, { from: 'them', text: data.content, raw: data, time: new Date(), secure: false });
                }

            };
        };
        connect();
        return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); if (ws.current) ws.current.close(); };
    }, []); 

    const addMessage = (contact, msgObj) => { setMessages(prev => ({ ...prev, [contact]: [...(prev[contact] || []), msgObj] })); };
    const handleTyping = (e) => { setInput(e.target.value); if (selectedUser && ws.current.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: "typing", to: selectedUser })); };
    
    const handleSend = async () => {
        const msgId = Date.now() + Math.random().toString(36).substr(2, 9); 
        if (!input || !selectedUser) return;
        try {
            if (encryptionEnabled) {
                const res = await fetch(`${API_URL}/get_key/${selectedUser}`);
                if (!res.ok) throw new Error("Target unavailable");
                const { public_key } = await res.json();
                const encryptedPayload = await encryptMessage(input, public_key);
                ws.current.send(JSON.stringify({ to: selectedUser, msg_id: msgId, ...encryptedPayload }));
                addMessage(selectedUser, { from: 'me', text: input, raw: encryptedPayload, time: new Date(), secure: true });
            } else {
                const plainPayload = { to: selectedUser, content: input, plaintext: true, timestamp: Date.now(), msg_id: msgId };
                ws.current.send(JSON.stringify(plainPayload));
                addMessage(selectedUser, { from: 'me', text: input, raw: plainPayload, time: new Date(), secure: false });
            }
            setInput("");
        } catch (e) { alert(e.message); }
    };

    useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), [messages, selectedUser, typingUser]);

    return html`
        <div className="fixed inset-0 w-full h-[100dvh] flex flex-col md:flex-row overflow-hidden font-mono" 
             style=${{ backgroundColor: "var(--bg-color)", color: "var(--main-text)" }}>
            
            <!-- OVERLAYS (Invite/Wait) -->
            ${gameStatus === 'waiting' ? html`<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 text-white"><div className="pixel-box p-8 text-center text-black bg-white"><div className="text-xl mb-4 font-bold animate-pulse">AWAITING UPLINK...</div><div className="mb-6 text-sm">TARGET: ${selectedUser}</div><button onClick=${cancelGame} className="btn-pixel w-full" style=${{color:'red', borderColor:'red'}}>ABORT</button></div></div>` : ''}
            ${incomingInvite ? html`<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90"><div className="pixel-box p-8 text-center border-4 border-yellow-500 bg-white text-black"><div className="text-xl mb-4 font-bold text-yellow-600">INCOMING SIGNAL</div><div className="mb-6 text-sm">FROM: ${incomingInvite.from}</div><div className="flex gap-4"><button onClick=${acceptInvite} className="btn-pixel flex-1 text-green-600">ACCEPT</button><button onClick=${rejectInvite} className="btn-pixel flex-1 text-red-500">DENY</button></div></div></div>` : ''}
            
            <!-- GAME COMPONENTS -->
            ${gameStatus === 'playing' && activeGame === 'pong' ? html`<${Pong} ws=${ws} myUsername=${username} opponent=${selectedUser} isHost=${isHost} onClose=${cancelGame} incomingMove=${gameSignal} />` : ''}
            ${gameStatus === 'playing' && activeGame === 'rps' ? html`<${RockPaperScissors} ws=${ws} myUsername=${username} opponent=${selectedUser} onClose=${cancelGame} incomingMove=${gameSignal} />` : ''}
            ${activeGame === 'sudoku' ? html`<${Sudoku} onClose=${cancelGame} />` : ''}

            <!-- SIDEBAR -->
            <div className=${`w-full md:w-1/4 flex-col border-r-4 h-full ${selectedUser ? 'hidden md:flex' : 'flex'}`} style=${{ borderColor: "var(--pixel-border)", backgroundColor: "var(--bg-color)" }}>
                <div className="p-4 border-b-4 flex justify-between items-start shrink-0" style=${{ borderColor: "var(--pixel-border)" }}>
                    <div>
                        <h2 className="text-xl mb-1" style=${{ fontFamily: '"Press Start 2P"' }}>HERMES</h2>
                        <div className="flex items-center gap-2">
                            <div className="text-xs font-bold" style=${{ color: "var(--shadow-color)" }}>
                                STATUS: <span className=${isConnected ? 'text-green-600' : 'text-red-600'}>${isConnected ? 'ONLINE' : 'RECONNECTING'}</span>
                                <br/>USER: ${username}
                            </div>
                            <!-- REFRESH BUTTON -->
                            <button onClick=${requestList} className="btn-pixel text-[10px] px-1 py-0 h-6 w-6 flex items-center justify-center text-blue-500 border-blue-500" title="REFRESH USER LIST">
                                <i className="fas fa-sync-alt"></i>
                            </button>
                        </div>
                    </div>
                    <button onClick=${handleLogout} className="btn-pixel text-xs px-3 py-1 text-red-500 border-red-500 hover:bg-red-500 hover:text-white" title="LOGOUT"><i class="fas fa-sign-out-alt"></i></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 min-h-0">
                    ${users.map(u => html`
                        <div key=${u} onClick=${() => setSelectedUser(u)} 
                             className=${`p-3 mb-2 cursor-pointer border-2 hover:opacity-80 ${selectedUser === u ? 'pixel-box' : ''}`}
                             style=${{ borderColor: "var(--pixel-border)", backgroundColor: selectedUser === u ? "var(--main-text)" : "transparent", color: selectedUser === u ? "var(--bg-color)" : "var(--main-text)" }}>
                            <span className="font-bold">> ${u}</span>
                        </div>
                    `)}
                </div>

                <!-- FOOTER BUTTONS -->
                <div className="p-4 border-t-4 shrink-0" style=${{ borderColor: "var(--pixel-border)" }}>
                    <button onClick=${() => setIsDark(!isDark)} className="w-full btn-pixel mb-3 flex justify-center gap-2">
                        <i className=${`fas ${isDark ? 'fa-sun' : 'fa-moon'}`}></i> ${isDark ? "LIGHT" : "DARK"}
                    </button>
                    <button onClick=${handlePanic} className="w-full btn-pixel text-red-600 border-red-600">
                        <i className="fas fa-skull"></i> KILL SWITCH
                    </button>
                </div>
            </div>

            <!-- CHAT AREA -->
            <div className=${`flex-1 flex-col relative h-full ${!selectedUser ? 'hidden md:flex' : 'flex'}`} style=${{ backgroundColor: "var(--bg-color)" }}>
                ${selectedUser ? html`
                    <div className="p-4 border-b-4 flex justify-between items-center sticky top-0 bg-[var(--bg-color)] z-10 shrink-0" style=${{ borderColor: "var(--pixel-border)", backgroundColor: "var(--bg-color)" }}>
                        <div class="flex items-center gap-3">
                            <button onClick=${() => setSelectedUser(null)} className="md:hidden btn-pixel px-2 py-1"><i class="fas fa-arrow-left"></i></button>
                            <div>
                                <span className="text-lg md:text-xl font-bold block truncate max-w-[150px]">> ${selectedUser}</span>
                                <div onClick=${() => setEncryptionEnabled(!encryptionEnabled)} class="cursor-pointer text-[10px] md:text-xs mt-1 font-bold ${encryptionEnabled ? 'text-green-600' : 'text-red-600'}">
                                    [ ${encryptionEnabled ? 'SECURE' : 'UNSECURED'} ]
                                </div>
                            </div>
                        </div>
                        <button onClick=${() => setShowDebug(!showDebug)} className="btn-pixel text-[8px] md:text-xs px-2">${showDebug ? "HIDE" : "RAW"}</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                        ${(messages[selectedUser] || []).map((m, idx) => {
                            const isMe = m.from === 'me';
                            const isSecure = m.secure !== false;
                            let bubbleBg = isMe ? (isDark ? "#FFD700" : "#1a1a1a") : (isDark ? "var(--bg-color)" : "#ffffff");
                            let bubbleColor = isMe ? (isDark ? "#1a1a1a" : "#FFD700") : (isDark ? "var(--main-text)" : "#000000");
                            let bubbleBorder = isMe ? (isDark ? "#1a1a1a" : "#FFD700") : (isDark ? "var(--pixel-border)" : "#000000");
                            // Comment out for MITM demo purpose
                            // if (!isSecure) {
                            //     bubbleBg = "var(--danger-red)";
                            //     bubbleColor = "#ffffff";
                            //     bubbleBorder = "var(--danger-red)";
                            // }

                            return html`
                                <div key=${idx} className=${`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                    <div className="max-w-[85%] md:max-w-[70%] p-3 border-4" style=${{boxShadow: "4px 4px 0px var(--shadow-color)", backgroundColor: bubbleBg, color: bubbleColor, borderColor: bubbleBorder }}>
                                        
                                        ${showDebug ? html`
                                            <div className="font-mono text-[10px] break-all">
                                                ${m.raw.plaintext ? `PLAINTEXT:${JSON.stringify(m.raw)}` : `AES:${m.raw.ciphertext.substring(0, 15)}...`}
                                            </div>
                                        ` : html`
                                            <!-- MANUALLY HARDCODED VULNERABILITY LOGIC -->
                                            ${SANITIZE_HTML_ENABLED 
                                                ? html`<p className="font-bold text-md md:text-lg break-words">${m.text}</p>` 
                                                : html`<p className="font-bold text-md md:text-lg break-words" dangerouslySetInnerHTML=${{__html: m.text}}></p>`
                                            }
                                        `}
                                        
                                        <div className="text-[9px] mt-1 text-right opacity-60 font-bold">
                                            ${m.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </div>
                                    </div>
                                </div>
                            `;
                        })}
                        <div ref=${messagesEndRef} />
                    </div>

                    <div className="p-2 md:p-4 border-t-4 flex gap-2 items-center shrink-0" style=${{ borderColor: "var(--pixel-border)" }}>
                        <div class="flex flex-col md:flex-row gap-1">
                            <button onClick=${() => initGame('sudoku')} className="btn-pixel p-2 text-xs">S</button>
                            <button onClick=${() => initGame('rps')} className="btn-pixel p-2 text-xs">R</button>
                            <button onClick=${() => initGame('pong')} className="btn-pixel p-2 text-xs">P</button>
                        </div>
                        <input type="text" value=${input} onChange=${handleTyping} onKeyPress=${e => e.key === 'Enter' && handleSend()} className=${`flex-1 input-pixel text-sm ${encryptionEnabled ? '' : 'border-red-500 text-red-600'}`} placeholder="MSG..." />
                        <button onClick=${handleSend} className="btn-pixel px-3 text-sm">></button>
                    </div>
                ` : html`
                    <div className="flex-1 flex items-center justify-center flex-col p-4 text-center" style=${{ color: "var(--shadow-color)" }}>
                        <div className="text-4xl mb-4" style=${{ color: "var(--main-text)" }}>?</div>
                        <p class="font-bold">SELECT A TARGET FROM THE LIST</p>
                    </div>
                `}
            </div>
        </div>
    `;
}

// import html from '../utils/html.js';
// import { API_URL, WS_URL } from '../utils/config.js';
// import { encryptMessage, decryptMessage } from '../utils/crypto.js';
// import RockPaperScissors from './RockPaperScissors.js';
// import Pong from './Pong.js';
// import Sudoku from './Sudoku.js'; 

// const { useState, useEffect, useRef } = React;

// export default function ChatInterface({ username, keyPair, onLogout }) {
//     const [users, setUsers] = useState([]);
//     const [selectedUser, setSelectedUser] = useState(null);
//     const [messages, setMessages] = useState({});
//     const [input, setInput] = useState("");
//     const [showDebug, setShowDebug] = useState(false);
//     const [isConnected, setIsConnected] = useState(false);
//     const [typingUser, setTypingUser] = useState(null); 
//     const typingTimeout = useRef(null);
//     const [encryptionEnabled, setEncryptionEnabled] = useState(true);
//     const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
    
//     // --- GAME STATES ---
//     const [activeGame, setActiveGame] = useState(null);
//     const [gameStatus, setGameStatus] = useState(null); // 'waiting', 'playing'
//     const [gameSignal, setGameSignal] = useState(null);
//     const [isHost, setIsHost] = useState(false);
//     const [incomingInvite, setIncomingInvite] = useState(null);

//     const selectedUserRef = useRef(null);
//     const activeGameRef = useRef(null); 
//     const ws = useRef(null);
//     const messagesEndRef = useRef(null);
//     const heartbeatRef = useRef(null);

//     useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);
//     useEffect(() => { activeGameRef.current = activeGame; }, [activeGame]);

//     useEffect(() => {
//         if (isDark) { document.body.classList.add('dark-mode'); localStorage.setItem('theme', 'dark'); } 
//         else { document.body.classList.remove('dark-mode'); localStorage.setItem('theme', 'light'); }
//     }, [isDark]);

//     const handleLogout = () => { if (ws.current) ws.current.close(); if (onLogout) onLogout(); };
//     const handlePanic = () => { if(confirm("⚠ WARNING: KILL SWITCH WILL WIPE MEMORY. PROCEED?")) handleLogout(); };

//     // --- GAME HANDSHAKE ---
//     const initGame = (type) => {
//         if (type === 'sudoku') { setActiveGame('sudoku'); setGameStatus('playing'); return; }
//         if (!selectedUser) return;
        
//         setActiveGame(type);
//         setGameStatus('waiting'); 
//         setIsHost(true);

//         ws.current.send(JSON.stringify({ 
//             type: "game_signal", gameType: type, action: "invite", to: selectedUser 
//         }));
//     };

//     const cancelGame = () => {
//         if (selectedUser && gameStatus === 'waiting') {
//             ws.current.send(JSON.stringify({ type: "game_signal", action: "cancel", to: selectedUser }));
//         }
//         setActiveGame(null); setGameStatus(null); setIsHost(false); setIncomingInvite(null);
//     };

//     const acceptInvite = () => {
//         if (!incomingInvite) return;
        
//         setSelectedUser(incomingInvite.from);
//         setActiveGame(incomingInvite.gameType);
//         setGameStatus('playing');
//         setIsHost(false); 
//         setIncomingInvite(null);

//         ws.current.send(JSON.stringify({ 
//             type: "game_signal", gameType: incomingInvite.gameType, action: "accept", to: incomingInvite.from 
//         }));
//     };

//     const rejectInvite = () => {
//         if (incomingInvite) {
//             ws.current.send(JSON.stringify({ type: "game_signal", action: "reject", to: incomingInvite.from }));
//             setIncomingInvite(null);
//         }
//     };

//     // WEBSOCKET
//     useEffect(() => {
//         const connect = () => {
//             if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) return;
//             ws.current = new WebSocket(`${WS_URL}/${username}`);

//             ws.current.onopen = () => {
//                 setIsConnected(true);
//                 if (heartbeatRef.current) clearInterval(heartbeatRef.current);
//                 heartbeatRef.current = setInterval(() => {
//                     if (ws.current && ws.current.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: "ping" }));
//                 }, 5000);
//             };

//             ws.current.onclose = () => {
//                 setIsConnected(false);
//                 if (heartbeatRef.current) clearInterval(heartbeatRef.current);
//                 setTimeout(connect, 2000);
//             };

//             ws.current.onmessage = async (event) => {
//                 const seenMessages = useRef(new Set());

//                 const data = JSON.parse(event.data);

//                 if (data.msg_id) {
//                     if (seenMessages.current.has(data.msg_id)) {
//                         console.warn("🛡️ HERMES: Duplicate/Tampered packet ignored.");
//                         return; // STOP HERE. Don't show the [Decryption Failed] bubble.
//                     }
//                     seenMessages.current.add(data.msg_id);
//                 }
                
//                 if (data.type === "user_list") { setUsers(data.users.filter(u => u !== username)); }
//                 else if (data.type === "user_left") {
//                     if (activeGameRef.current && selectedUserRef.current === data.username) {
//                         setActiveGame(null); setGameStatus(null); setIncomingInvite(null);
//                         alert("Opponent disconnected.");
//                     }
//                 }
                
//                 // --- GAME LOGIC ---
//                 else if (data.type === "game_signal") {
                    
//                     if (data.action === "invite") {
//                         if(activeGameRef.current) return; 
//                         setIncomingInvite({ from: data.from, gameType: data.gameType });
//                     }
//                     // FIX: Check acceptance based on GAME TYPE, not strictly user (avoids sync issues)
//                     else if (data.action === "accept") {
//                         if (activeGameRef.current === data.gameType) {
//                             console.log("GAME ACCEPTED");
//                             setGameStatus('playing');
//                         }
//                     }
//                     else if (data.action === "reject" || data.action === "cancel") {
//                         if (data.from === selectedUserRef.current) {
//                             setActiveGame(null); setGameStatus(null); setIncomingInvite(null);
//                             alert("Game session ended.");
//                         }
//                     }
//                     else if (data.from === selectedUserRef.current) {
//                         setGameSignal(data);
//                     }
//                 }
//                 else if (data.type === "typing_signal") { /* ... */ }
//                 else if (data.ciphertext) {
//                     const decryptedText = await decryptMessage(data, keyPair.privateKey);
//                     addMessage(data.from, { from: 'them', text: decryptedText, raw: data, time: new Date(), secure: true });
//                 }
//                 else if (data.plaintext) {
//                     addMessage(data.from, { from: 'them', text: data.content, raw: data, time: new Date(), secure: false });
//                 }
//             };
//         };
//         connect();
//         return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); if (ws.current) ws.current.close(); };
//     }, []); 

//     const addMessage = (contact, msgObj) => { setMessages(prev => ({ ...prev, [contact]: [...(prev[contact] || []), msgObj] })); };
//     const handleTyping = (e) => { setInput(e.target.value); if (selectedUser && ws.current.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: "typing", to: selectedUser })); };
//     const handleSend = async () => {
//         const msgId = Date.now() + Math.random().toString(36).substr(2, 9); 
//         if (!input || !selectedUser) return;
//         try {
//             if (encryptionEnabled) {
//                 const res = await fetch(`${API_URL}/get_key/${selectedUser}`);
//                 if (!res.ok) throw new Error("Target unavailable");
//                 const { public_key } = await res.json();
//                 const encryptedPayload = await encryptMessage(input, public_key);
//                 ws.current.send(JSON.stringify({ to: selectedUser, msg_id: msgId, ...encryptedPayload }));
//                 addMessage(selectedUser, { from: 'me', text: input, raw: encryptedPayload, time: new Date(), secure: true });
//             } else {
//                 const plainPayload = { to: selectedUser, content: input, plaintext: true, timestamp: Date.now() };
//                 ws.current.send(JSON.stringify(plainPayload));
//                 addMessage(selectedUser, { from: 'me', text: input, raw: plainPayload, time: new Date(), secure: false });
//             }
//             setInput("");
//         } catch (e) { alert(e.message); }
//     };

//     useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), [messages, selectedUser, typingUser]);

//     return html`
//         <div className="h-[100dvh] flex overflow-hidden font-mono" style=${{ backgroundColor: "var(--bg-color)", color: "var(--main-text)" }}>
            
//             ${gameStatus === 'waiting' ? html`
//                 <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 text-white">
//                     <div className="pixel-box p-8 text-center text-black bg-white">
//                         <div className="text-xl mb-4 font-bold animate-pulse">AWAITING UPLINK...</div>
//                         <div className="mb-6 text-sm">TARGET: ${selectedUser}</div>
//                         <button onClick=${cancelGame} className="btn-pixel w-full" style=${{color:'red', borderColor:'red'}}>ABORT</button>
//                     </div>
//                 </div>
//             ` : ''}

//             ${incomingInvite ? html`
//                 <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90">
//                     <div className="pixel-box p-8 text-center border-4 border-yellow-500 bg-white text-black">
//                         <div className="text-xl mb-4 font-bold text-yellow-600">INCOMING SIGNAL</div>
//                         <div className="mb-6 text-sm">FROM: ${incomingInvite.from}</div>
//                         <div className="flex gap-4">
//                             <button onClick=${acceptInvite} className="btn-pixel flex-1 text-green-600">ACCEPT</button>
//                             <button onClick=${rejectInvite} className="btn-pixel flex-1 text-red-500">DENY</button>
//                         </div>
//                     </div>
//                 </div>
//             ` : ''}

//             ${gameStatus === 'playing' && activeGame === 'pong' ? html`<${Pong} ws=${ws} myUsername=${username} opponent=${selectedUser} isHost=${isHost} onClose=${cancelGame} incomingMove=${gameSignal} />` : ''}
//             ${gameStatus === 'playing' && activeGame === 'rps' ? html`<${RockPaperScissors} ws=${ws} myUsername=${username} opponent=${selectedUser} onClose=${cancelGame} incomingMove=${gameSignal} />` : ''}
//             ${activeGame === 'sudoku' ? html`<${Sudoku} onClose=${cancelGame} />` : ''}

//             <!-- SIDEBAR -->
//             <div className=${`w-full md:w-1/4 flex-col border-r-4 ${selectedUser ? 'hidden md:flex' : 'flex'}`} style=${{ borderColor: "var(--pixel-border)", backgroundColor: "var(--bg-color)" }}>
//                 <div className="p-4 border-b-4 flex justify-between items-start" style=${{ borderColor: "var(--pixel-border)" }}>
//                     <div>
//                         <h2 className="text-xl mb-1" style=${{ fontFamily: '"Press Start 2P"' }}>HERMES</h2>
//                         <div className="text-xs font-bold" style=${{ color: "var(--shadow-color)" }}>
//                             STATUS: <span className=${isConnected ? 'text-green-600' : 'text-red-600'}>${isConnected ? 'ONLINE' : 'RECONNECTING'}</span>
//                             <br/>USER: ${username}
//                         </div>
//                     </div>
//                     <button onClick=${handleLogout} className="btn-pixel text-xs px-2 text-red-500 border-red-500" title="LOGOUT"><i class="fas fa-sign-out-alt"></i></button>
//                 </div>
//                 <div className="flex-1 overflow-y-auto p-2">
//                     ${users.map(u => html`
//                         <div key=${u} onClick=${() => setSelectedUser(u)} 
//                              className=${`p-3 mb-2 cursor-pointer border-2 hover:opacity-80 ${selectedUser === u ? 'pixel-box' : ''}`}
//                              style=${{ borderColor: "var(--pixel-border)", backgroundColor: selectedUser === u ? "var(--main-text)" : "transparent", color: selectedUser === u ? "var(--bg-color)" : "var(--main-text)" }}>
//                             <span className="font-bold">> ${u}</span>
//                         </div>
//                     `)}
//                 </div>
//                 <div className="p-4 border-t-4" style=${{ borderColor: "var(--pixel-border)" }}>
//                     <button onClick=${() => setIsDark(!isDark)} className="w-full btn-pixel mb-3 flex justify-center gap-2"><i className=${`fas ${isDark ? 'fa-sun' : 'fa-moon'}`}></i> ${isDark ? "LIGHT" : "DARK"}</button>
//                     <button onClick=${handlePanic} className="w-full btn-pixel text-red-600 border-red-600">KILL SWITCH</button>
//                 </div>
//             </div>

//             <div className=${`flex-1 flex-col relative ${!selectedUser ? 'hidden md:flex' : 'flex'}`} style=${{ backgroundColor: "var(--bg-color)" }}>
//                 ${selectedUser ? html`
//                     <div className="p-4 border-b-4 flex justify-between items-center sticky top-0 bg-[var(--bg-color)] z-10" style=${{ borderColor: "var(--pixel-border)" }}>
//                         <div class="flex items-center gap-3">
//                             <button onClick=${() => setSelectedUser(null)} className="md:hidden btn-pixel px-2 py-1"><i class="fas fa-arrow-left"></i></button>
//                             <div>
//                                 <span className="text-lg md:text-xl font-bold block truncate max-w-[150px]">> ${selectedUser}</span>
//                                 <div onClick=${() => setEncryptionEnabled(!encryptionEnabled)} class="cursor-pointer text-[10px] md:text-xs mt-1 font-bold ${encryptionEnabled ? 'text-green-600' : 'text-red-600'}">
//                                     [ ${encryptionEnabled ? 'SECURE' : 'UNSECURED'} ]
//                                 </div>
//                             </div>
//                         </div>
//                         <button onClick=${() => setShowDebug(!showDebug)} className="btn-pixel text-[8px] md:text-xs px-2">${showDebug ? "HIDE" : "RAW"}</button>
//                     </div>
//                     <div className="flex-1 overflow-y-auto p-4 space-y-4">
//                         ${(messages[selectedUser] || []).map((m, idx) => {
//                             if (m.from === 'system') return html`<div key=${idx} className="text-center font-bold text-xs border-y border-dashed py-1" style=${{ borderColor: "var(--shadow-color)", color: "var(--shadow-color)" }}>${m.text}</div>`;
//                             const isMe = m.from === 'me';
//                             const isSecure = m.secure !== false;
                            
//                             let bubbleBg, bubbleColor, bubbleBorder;
//                             if (isDark) { if (isMe) { bubbleBg = "#FFD700"; bubbleColor = "#1a1a1a"; bubbleBorder = "#1a1a1a"; } else { bubbleBg = isSecure ? "var(--bg-color)" : "var(--danger-red)"; bubbleColor = isSecure ? "var(--main-text)" : "#fff"; bubbleBorder = isSecure ? "var(--pixel-border)" : "var(--danger-red)"; } } 
//                             else { if (isMe) { bubbleBg = "#1a1a1a"; bubbleColor = "#FFD700"; bubbleBorder = "#FFD700"; } else { bubbleBg = isSecure ? "#ffffff" : "var(--danger-red)"; bubbleColor = isSecure ? "#000000" : "#fff"; bubbleBorder = isSecure ? "#000000" : "var(--danger-red)"; } }

//                             return html`
//                                 <div key=${idx} className=${`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
//                                     <div className="max-w-[85%] md:max-w-[70%] p-3 border-4" style=${{ boxShadow: "4px 4px 0px var(--shadow-color)", backgroundColor: bubbleBg, color: bubbleColor, borderColor: bubbleBorder }}>
//                                         ${showDebug ? html`<div className="font-mono text-[10px] break-all">${m.raw.plaintext ? html`PLAINTEXT:${JSON.stringify(m.raw)}` : html`AES:${m.raw.ciphertext.substring(0, 15)}...`}</div>` : html`<p className="font-bold text-md md:text-lg break-words" dangerouslySetInnerHTML=${{__html: m.text}}></p>`}
//                                         <div className="text-[9px] mt-1 text-right opacity-60 font-bold">${m.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
//                                     </div>
//                                 </div>
//                             `;
//                         })}
//                         <div ref=${messagesEndRef} />
//                     </div>
//                     <div className="p-2 md:p-4 border-t-4 flex gap-2 items-center" style=${{ borderColor: "var(--pixel-border)" }}>
//                         <div class="flex flex-col md:flex-row gap-1">
//                             <button onClick=${() => initGame('sudoku')} className="btn-pixel p-2 text-xs" title="SUDOKU">S</button>
//                             <button onClick=${() => initGame('rps')} className="btn-pixel p-2 text-xs" title="RPS">R</button>
//                             <button onClick=${() => initGame('pong')} className="btn-pixel p-2 text-xs" title="PONG">P</button>
//                         </div>
//                         <input type="text" value=${input} onChange=${handleTyping} onKeyPress=${e => e.key === 'Enter' && handleSend()} className=${`flex-1 input-pixel text-sm ${encryptionEnabled ? '' : 'border-red-500 text-red-600'}`} placeholder="MSG..." />
//                         <button onClick=${handleSend} className="btn-pixel px-3 text-sm">></button>
//                     </div>
//                 ` : html`
//                     <div className="flex-1 flex items-center justify-center flex-col font-mono p-4 text-center" style=${{ color: "var(--shadow-color)" }}>
//                         <div className="text-4xl mb-4" style=${{ color: "var(--main-text)" }}>?</div>
//                         <p class="font-bold">SELECT A TARGET FROM THE LIST</p>
//                     </div>
//                 `}
//             </div>
//         </div>
//     `;
// }