import html from '../utils/html.js';
const { useState, useEffect } = React;

export default function RockPaperScissors({ ws, myUsername, opponent, onClose, incomingMove }) {
    const [myMove, setMyMove] = useState(null);
    const [opponentMove, setOpponentMove] = useState(null);
    const [result, setResult] = useState(null);
    
    // Handshake State
    const [isHost, setIsHost] = useState(false);
    const [waiting, setWaiting] = useState(true);

    const moves = [
        { id: 'rock', label: 'ROCK', icon: 'fa-hand-rock' },
        { id: 'paper', label: 'PAPER', icon: 'fa-hand-paper' },
        { id: 'scissors', label: 'SCISSORS', icon: 'fa-hand-scissors' }
    ];

    // --- INITIALIZATION ---
    useEffect(() => {
        if (incomingMove && incomingMove.action === "init_host") {
            setIsHost(true);
            setWaiting(true); // Host waits
        } else {
            setIsHost(false);
            setWaiting(false); // Guest is ready
            // Send handshake
            ws.current.send(JSON.stringify({
                type: "game_signal",
                gameType: "rps",
                action: "player_joined",
                to: opponent
            }));
        }
    }, []);

    // --- GAME LOGIC ---
    useEffect(() => {
        if (myMove && opponentMove) {
            if (myMove === opponentMove) setResult("DRAW");
            else if (
                (myMove === 'rock' && opponentMove === 'scissors') ||
                (myMove === 'paper' && opponentMove === 'rock') ||
                (myMove === 'scissors' && opponentMove === 'paper')
            ) setResult("VICTORY");
            else setResult("DEFEAT");
        }
    }, [myMove, opponentMove]);

    // --- NETWORK SYNC ---
    useEffect(() => {
        if (!incomingMove || incomingMove.gameType !== "rps") return;
        
        // Handshake
        if (incomingMove.action === "player_joined" && isHost) {
            setWaiting(false);
        }
        // Moves
        else if (incomingMove.action === "move") {
            setOpponentMove(incomingMove.move);
        }
    }, [incomingMove, isHost]);

    const handleReset = () => {
        setMyMove(null);
        setOpponentMove(null);
        setResult(null);
    }

    return html`
        <div className="absolute inset-0 z-50 flex items-center justify-center" style=${{ backgroundColor: "rgba(0,0,0,0.9)" }}>
            <div className="pixel-box p-8 w-96 flex flex-col items-center relative">
                
                ${waiting ? html`
                    <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-10 border-4 border-black">
                        <div className="text-black font-bold animate-pulse text-center">
                            WAITING FOR<br/>${opponent}...
                        </div>
                    </div>
                ` : ''}

                <h2 className="text-xl mb-2 text-center" style=${{ fontFamily: '"Press Start 2P"' }}>R.P.S.</h2>
                <div className="w-full border-b-4 mb-6" style=${{ borderColor: "var(--main-text)" }}></div>

                <!-- STATUS -->
                <div className="mb-8 text-center min-h-[50px] w-full border-2 border-dashed p-2" style=${{ borderColor: "var(--shadow-color)" }}>
                    ${result 
                        ? html`
                            <div className=${`text-2xl font-bold font-mono ${result === 'VICTORY' ? 'text-green-600' : (result === 'DEFEAT' ? 'text-red-600' : 'text-gray-600')}`}>
                                ${result}
                            </div>
                            <div className="text-xs mt-1 font-mono">
                                ENEMY: ${opponentMove.toUpperCase()}
                            </div>
                            <button onClick=${handleReset} className="mt-2 text-xs underline cursor-pointer">REMATCH</button>
                        `
                        : html`
                            <div className="text-sm font-mono font-bold mt-2">
                                ${!myMove ? "CHOOSE WEAPON" : "WAITING FOR ENEMY..."}
                            </div>
                            ${opponentMove && !result ? html`<div className="text-xs text-red-600 font-bold animate-pulse mt-1">! ENEMY READY !</div>` : ''}
                        `
                    }
                </div>

                <!-- BUTTONS -->
                <div className="flex gap-2 mb-8">
                    ${moves.map(m => html`
                        <button 
                            key=${m.id}
                            disabled=${!!myMove || waiting}
                            onClick=${() => {
                                setMyMove(m.id);
                                ws.current.send(JSON.stringify({
                                    type: "game_signal",
                                    gameType: "rps",
                                    action: "move",
                                    to: opponent,
                                    move: m.id
                                }));
                            }}
                            className=${`
                                w-24 h-24 btn-pixel flex flex-col items-center justify-center
                                ${myMove === m.id ? 'invert-colors' : ''}
                                ${!!myMove && myMove !== m.id ? 'opacity-20' : ''}
                            `}
                            style=${{ 
                                backgroundColor: myMove === m.id ? "var(--main-text)" : "var(--bg-color)",
                                color: myMove === m.id ? "var(--bg-color)" : "var(--main-text)"
                            }}
                        >
                            <i className=${`fas ${m.icon} text-2xl mb-2`}></i>
                            <span className="text-[10px]">${m.label}</span>
                        </button>
                    `)}
                </div>

                <button onClick=${onClose} className="btn-pixel w-full text-xs">CLOSE MODULE</button>
            </div>
        </div>
    `;
}