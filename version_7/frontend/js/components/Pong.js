import html from '../utils/html.js';
const { useState, useEffect, useRef } = React;

export default function Pong({ ws, myUsername, opponent, onClose, incomingMove, isHost }) {
    const canvasRef = useRef(null);
    const gameState = useRef({
        ball: { x: 300, y: 200, dx: 4, dy: 4 },
        paddle1: { y: 150, h: 60, w: 15 },
        paddle2: { y: 150, h: 60, w: 15 },
        score: { host: 0, guest: 0 },
        running: true
    });

    // ... (Keep existing Game Loop and Update Logic same as before) ...
    // Just copy the useEffect from the previous working Pong.js
    // I am omitting the physics code block here for brevity, assume it is same as previous answer.
    
    // RE-INSERT PHYSICS LOGIC FROM PREVIOUS ANSWER HERE inside useEffect
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
            if (isHost) {
                state.ball.x += state.ball.dx; 
                state.ball.y += state.ball.dy;
                if (state.ball.y + 5 > 400 || state.ball.y - 5 < 0) state.ball.dy *= -1;
                
                if (state.ball.x - 5 < 25 && state.ball.y > state.paddle1.y && state.ball.y < state.paddle1.y + state.paddle1.h) state.ball.dx = Math.abs(state.ball.dx) * 1.05;
                if (state.ball.x + 5 > 575 && state.ball.y > state.paddle2.y && state.ball.y < state.paddle2.y + state.paddle2.h) state.ball.dx = -Math.abs(state.ball.dx) * 1.05;

                if (state.ball.x < 0) {
                    state.score.guest += 1; resetBall(state); broadcast(state);
                } else if (state.ball.x > 600) {
                    state.score.host += 1; resetBall(state); broadcast(state);
                }

                if (ws.current.readyState === WebSocket.OPEN) {
                    ws.current.send(JSON.stringify({ type: "game_signal", gameType: "pong", action: "sync", to: opponent, ball: state.ball }));
                }
            }
        };

        const broadcast = (state) => {
            ws.current.send(JSON.stringify({ type: "game_signal", gameType: "pong", action: "score", to: opponent, score: state.score }));
        };

        const draw = (ctx) => {
            const state = gameState.current;
            const isDark = document.body.classList.contains('dark-mode');
            const color = isDark ? '#ffffff' : '#000000';
            const bg = isDark ? '#000000' : '#ffffff';

            ctx.fillStyle = bg; ctx.fillRect(0, 0, 600, 400);
            
            ctx.fillStyle = color; ctx.font = '60px "Press Start 2P", monospace';
            ctx.textAlign = "center"; ctx.globalAlpha = 0.2; 
            ctx.fillText(state.score.host, 150, 80); 
            ctx.fillText(state.score.guest, 450, 80);
            ctx.globalAlpha = 1.0; 

            ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.setLineDash([10, 10]);
            ctx.beginPath(); ctx.moveTo(300, 0); ctx.lineTo(300, 400); ctx.stroke(); ctx.setLineDash([]);
            
            ctx.fillRect(10, state.paddle1.y, 15, state.paddle1.h);
            ctx.fillRect(575, state.paddle2.y, 15, state.paddle2.h);
            ctx.fillRect(state.ball.x - 5, state.ball.y - 5, 10, 10);
        };

        const resetBall = (state) => { state.ball = { x: 300, y: 200, dx: 4, dy: 4 }; };
        loop();
        return () => { gameState.current.running = false; cancelAnimationFrame(animationFrameId); };
    }, [isHost]);

    // --- INPUT HANDLING (MOUSE + TOUCH) ---
    const processInput = (clientY, rect) => {
        const scaleY = 400 / rect.height;
        const y = Math.max(0, Math.min(340, (clientY - rect.top) * scaleY - 30));
        
        if (isHost) gameState.current.paddle1.y = y;
        else gameState.current.paddle2.y = y;

        if (ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: "game_signal", gameType: "pong", action: "move", to: opponent, y: y, isHost: isHost }));
        }
    };

    const handleMouseMove = (e) => {
        processInput(e.clientY, canvasRef.current.getBoundingClientRect());
    };

    const handleTouchMove = (e) => {
        e.preventDefault(); // Prevent scrolling
        processInput(e.touches[0].clientY, canvasRef.current.getBoundingClientRect());
    };

    useEffect(() => {
        if (!incomingMove) return;
        const data = incomingMove;
        if (data.action === "move") {
            if (data.isHost) gameState.current.paddle1.y = data.y;
            else gameState.current.paddle2.y = data.y;
        }
        else if (data.action === "sync" && !isHost) gameState.current.ball = data.ball;
        else if (data.action === "score") gameState.current.score = data.score;
    }, [incomingMove]);

    return html`
        <div className="absolute inset-0 z-50 flex items-center justify-center" style=${{ backgroundColor: "rgba(0,0,0,0.9)" }}>
            <div className="pixel-box p-2 flex flex-col items-center w-full max-w-2xl mx-2">
                
                <!-- SCALABLE CANVAS -->
                <canvas ref=${canvasRef} width="600" height="400" 
                    onMouseMove=${handleMouseMove}
                    onTouchMove=${handleTouchMove}
                    className="border-4 cursor-none mb-4 w-full h-auto" 
                    style=${{ borderColor: "var(--main-text)", touchAction: "none" }}></canvas>

                <button onClick=${onClose} className="btn-pixel w-full text-xs py-4">EXIT GAME</button>
                
                <div class="mt-2 text-[10px] font-mono text-center" style=${{color: "var(--shadow-color)"}}>
                    DRAG TO MOVE PADDLE
                </div>
            </div>
        </div>
    `;
}