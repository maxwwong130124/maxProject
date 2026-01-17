import html from '../utils/html.js';
const { useState, useEffect, useRef } = React;

export default function Pong({ ws, myUsername, opponent, onClose, incomingMove, isHost }) {
    const canvasRef = useRef(null);
    
    // GAME STATE
    // Paddle 1 = Left (Host)
    // Paddle 2 = Right (Guest)
    const gameState = useRef({
        ball: { x: 300, y: 200, dx: 4, dy: 4 },
        paddle1Y: 150, 
        paddle2Y: 150, 
        score: { host: 0, guest: 0 },
        running: true
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        const loop = () => {
            if (!gameState.current.running) return;
            update();
            draw(ctx);
            animationFrameId = requestAnimationFrame(loop);
        };

        const update = () => {
            const state = gameState.current;
            
            // --- PHYSICS (HOST ONLY) ---
            if (isHost) {
                state.ball.x += state.ball.dx; 
                state.ball.y += state.ball.dy;

                // 1. Wall Bounces (Top/Bottom)
                if (state.ball.y <= 0 || state.ball.y >= 400) state.ball.dy *= -1;
                
                // 2. Paddle Collisions
                // Host Paddle (Left, x=10)
                if (state.ball.x <= 25 && state.ball.y >= state.paddle1Y && state.ball.y <= state.paddle1Y + 60) {
                    state.ball.dx = Math.abs(state.ball.dx) * 1.05; // Bounce Right
                }
                // Guest Paddle (Right, x=575)
                if (state.ball.x >= 575 && state.ball.y >= state.paddle2Y && state.ball.y <= state.paddle2Y + 60) {
                    state.ball.dx = -Math.abs(state.ball.dx) * 1.05; // Bounce Left
                }

                // 3. Scoring
                if (state.ball.x < 0) {
                    state.score.guest += 1; 
                    resetBall(state); 
                    broadcast(state, "score");
                } else if (state.ball.x > 600) {
                    state.score.host += 1; 
                    resetBall(state); 
                    broadcast(state, "score");
                }

                // 4. Sync Ball to Guest (Every frame is too much, but fine for LAN)
                if (ws.current.readyState === WebSocket.OPEN) {
                    ws.current.send(JSON.stringify({ 
                        type: "game_signal", gameType: "pong", action: "sync", to: opponent, 
                        ball: state.ball 
                    }));
                }
            }
        };

        const broadcast = (state, action) => {
            ws.current.send(JSON.stringify({ 
                type: "game_signal", gameType: "pong", action: action, to: opponent, 
                score: state.score 
            }));
        };

        const draw = (ctx) => {
            const state = gameState.current;
            const isDark = document.body.classList.contains('dark-mode');
            const color = isDark ? '#ffffff' : '#000000';
            const bg = isDark ? '#000000' : '#ffffff';

            // Clear
            ctx.fillStyle = bg; 
            ctx.fillRect(0, 0, 600, 400);
            
            // Score
            ctx.fillStyle = color; 
            ctx.font = '60px "Press Start 2P", monospace';
            ctx.textAlign = "center"; 
            ctx.globalAlpha = 0.15; 
            ctx.fillText(state.score.host, 150, 80); 
            ctx.fillText(state.score.guest, 450, 80);
            ctx.globalAlpha = 1.0; 

            // Net
            ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.setLineDash([10, 10]);
            ctx.beginPath(); ctx.moveTo(300, 0); ctx.lineTo(300, 400); ctx.stroke(); ctx.setLineDash([]);
            
            // Paddles
            ctx.fillRect(10, state.paddle1Y, 15, 60);  // Left (Host)
            ctx.fillRect(575, state.paddle2Y, 15, 60); // Right (Guest)
            
            // Ball
            ctx.fillRect(state.ball.x - 5, state.ball.y - 5, 10, 10); 
            
            // Labels
            ctx.font = '10px "VT323", monospace';
            ctx.fillText(isHost ? `${myUsername} (YOU)` : opponent, 30, 390);
            ctx.fillText(isHost ? opponent : `${myUsername} (YOU)`, 570, 390);
        };

        const resetBall = (state) => { state.ball = { x: 300, y: 200, dx: 4 * (Math.random() > 0.5 ? 1 : -1), dy: 4 * (Math.random() > 0.5 ? 1 : -1) }; };
        
        loop();
        return () => { gameState.current.running = false; cancelAnimationFrame(animationFrameId); };
    }, [isHost]); 

    // --- INPUT HANDLING ---
    const handleMouseMove = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleY = 400 / rect.height;
        const relativeY = (e.clientY - rect.top) * scaleY;
        const y = Math.max(0, Math.min(340, relativeY - 30));
        
        // Update LOCAL State
        if (isHost) gameState.current.paddle1Y = y; // I am Left
        else gameState.current.paddle2Y = y;        // I am Right

        // Broadcast Move
        if (ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ 
                type: "game_signal", gameType: "pong", action: "move", to: opponent, 
                y: y, isHost: isHost 
            }));
        }
    };

    // --- NETWORK SYNC ---
    useEffect(() => {
        if (!incomingMove) return;
        const data = incomingMove;
        
        if (data.action === "move") {
            // Update REMOTE State
            if (data.isHost) gameState.current.paddle1Y = data.y; // Host moved Left Paddle
            else gameState.current.paddle2Y = data.y;             // Guest moved Right Paddle
        }
        else if (data.action === "sync" && !isHost) {
            gameState.current.ball = data.ball;
        }
        else if (data.action === "score") {
            gameState.current.score = data.score;
        }
    }, [incomingMove]);

    return html`
        <div className="absolute inset-0 z-50 flex items-center justify-center" style=${{ backgroundColor: "rgba(0,0,0,0.85)" }}>
            <div className="pixel-box p-4 flex flex-col items-center w-full max-w-2xl mx-2">
                <canvas ref=${canvasRef} width="600" height="400" onMouseMove=${handleMouseMove}
                    className="border-4 cursor-none mb-4 w-full h-auto" style=${{ borderColor: "var(--main-text)", touchAction: "none" }}></canvas>
                <button onClick=${onClose} className="btn-pixel w-full text-xs">ABORT MATCH</button>
                <div class="mt-2 text-xs font-mono text-center" style=${{color: "var(--shadow-color)"}}>
                    MOVE MOUSE TO CONTROL PADDLE
                </div>
            </div>
        </div>
    `;
}