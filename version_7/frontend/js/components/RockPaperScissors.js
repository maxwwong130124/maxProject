import html from '../utils/html.js';
const { useState, useEffect } = React;

export default function RockPaperScissors({ ws, myUsername, opponent, onClose, incomingMove }) {
    const [myMove, setMyMove] = useState(null);
    const [opponentMove, setOpponentMove] = useState(null);
    const [result, setResult] = useState(null);

    const moves = [
        { id: 'rock', label: 'ROCK', icon: 'fa-hand-rock' },
        { id: 'paper', label: 'PAPER', icon: 'fa-hand-paper' },
        { id: 'scissors', label: 'SCISSORS', icon: 'fa-hand-scissors' }
    ];

    // Determine Winner
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

    // Handle Incoming
    useEffect(() => {
        if (!incomingMove || incomingMove.gameType !== "rps") return;
        if (incomingMove.action === "move") {
            setOpponentMove(incomingMove.move);
        }
    }, [incomingMove]);

    const handleReset = () => {
        setMyMove(null); setOpponentMove(null); setResult(null);
    }

    return html`
        <div className="absolute inset-0 z-50 flex items-center justify-center" style=${{ backgroundColor: "rgba(0,0,0,0.85)" }}>
            <div className="pixel-box p-8 w-96 flex flex-col items-center relative bg-white text-black">
                <h2 className="text-xl mb-2 text-center" style=${{ fontFamily: '"Press Start 2P"' }}>R.P.S.</h2>
                <div className="w-full border-b-4 mb-6" style=${{ borderColor: "var(--main-text)" }}></div>

                <div className="mb-8 text-center min-h-[60px] w-full border-2 border-dashed p-4" style=${{ borderColor: "var(--shadow-color)" }}>
                    ${result ? html`
                        <div className=${`text-2xl font-bold font-mono ${result === 'VICTORY' ? 'text-green-600' : (result === 'DEFEAT' ? 'text-red-600' : 'text-gray-600')}`}>${result}</div>
                        <div className="text-xs mt-2 font-mono">ENEMY CHOSE: ${opponentMove.toUpperCase()}</div>
                        <button onClick=${handleReset} className="mt-2 text-xs underline cursor-pointer hover:bg-black hover:text-white px-2">PLAY AGAIN</button>
                    ` : html`
                        <div className="text-sm font-mono font-bold">${!myMove ? "CHOOSE WEAPON" : "WAITING FOR ENEMY..."}</div>
                        ${opponentMove && !result ? html`<div className="text-xs text-red-600 font-bold animate-pulse mt-2">! ENEMY READY !</div>` : ''}
                    `}
                </div>

                <div className="flex gap-2 mb-8">
                    ${moves.map(m => html`
                        <button key=${m.id} disabled=${!!myMove}
                            onClick=${() => {
                                setMyMove(m.id);
                                ws.current.send(JSON.stringify({ type: "game_signal", gameType: "rps", action: "move", to: opponent, move: m.id }));
                            }}
                            className=${`w-24 h-24 btn-pixel flex flex-col items-center justify-center ${myMove === m.id ? 'bg-black text-white' : ''} ${!!myMove && myMove !== m.id ? 'opacity-20' : ''}`}
                        >
                            <i className=${`fas ${m.icon} text-2xl mb-2`}></i><span className="text-[10px]">${m.label}</span>
                        </button>
                    `)}
                </div>
                <button onClick=${onClose} className="btn-pixel w-full text-xs">EXIT GAME</button>
            </div>
        </div>
    `;
}