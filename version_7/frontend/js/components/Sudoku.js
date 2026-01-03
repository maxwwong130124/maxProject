import html from '../utils/html.js';
const { useState, useEffect } = React;

// Simple valid puzzle template (0 = empty)
const INITIAL_PUZZLE = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9]
];

// Solution for validation
const SOLVED_PUZZLE = [
    [5, 3, 4, 6, 7, 8, 9, 1, 2],
    [6, 7, 2, 1, 9, 5, 3, 4, 8],
    [1, 9, 8, 3, 4, 2, 5, 6, 7],
    [8, 5, 9, 7, 6, 1, 4, 2, 3],
    [4, 2, 6, 8, 5, 3, 7, 9, 1],
    [7, 1, 3, 9, 2, 4, 8, 5, 6],
    [9, 6, 1, 5, 3, 7, 2, 8, 4],
    [2, 8, 7, 4, 1, 9, 6, 3, 5],
    [3, 4, 5, 2, 8, 6, 1, 7, 9]
];

export default function Sudoku({ onClose }) {
    // Deep copy to avoid mutating constant
    const [grid, setGrid] = useState(JSON.parse(JSON.stringify(INITIAL_PUZZLE)));
    const [status, setStatus] = useState("SOLVE THE PUZZLE");
    const [selected, setSelected] = useState([null, null]); // [row, col]

    const handleInput = (num) => {
        const [r, c] = selected;
        if (r === null || INITIAL_PUZZLE[r][c] !== 0) return; // Locked cell

        const newGrid = [...grid];
        newGrid[r][c] = num;
        setGrid(newGrid);
    };

    const checkSolution = () => {
        let isCorrect = true;
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                if (grid[i][j] !== SOLVED_PUZZLE[i][j]) {
                    isCorrect = false;
                    break;
                }
            }
        }
        setStatus(isCorrect ? "SYSTEM UNLOCKED!" : "INVALID CHECKSUM");
    };

    // Keyboard support
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key >= '1' && e.key <= '9') handleInput(parseInt(e.key));
            if (e.key === 'Backspace' || e.key === 'Delete') handleInput(0);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selected, grid]);

    return html`
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/90">
            <div className="pixel-box p-6 flex flex-col items-center shadow-[10px_10px_0px_#000]">
                
                <h2 className="text-xl mb-4 font-bold text-black" style=${{ fontFamily: '"Press Start 2P"' }}>SUDOKU</h2>
                
                <div className="mb-4 text-center font-mono font-bold text-sm bg-black text-white py-1 w-full">
                    > ${status}
                </div>

                <!-- BOARD -->
                <div className="grid grid-cols-9 border-4 border-black bg-black gap-px mb-6">
                    ${grid.map((row, rIdx) => 
                        row.map((cell, cIdx) => {
                            // Thick borders for 3x3 subgrids
                            const borderR = (cIdx + 1) % 3 === 0 && cIdx !== 8 ? 'border-r-4 border-r-black' : '';
                            const borderB = (rIdx + 1) % 3 === 0 && rIdx !== 8 ? 'border-b-4 border-b-black' : '';
                            const isLocked = INITIAL_PUZZLE[rIdx][cIdx] !== 0;
                            const isSelected = selected[0] === rIdx && selected[1] === cIdx;

                            return html`
                                <div key=${`${rIdx}-${cIdx}`} 
                                     onClick=${() => setSelected([rIdx, cIdx])}
                                     className=${`
                                        w-8 h-8 flex items-center justify-center font-mono text-lg cursor-pointer
                                        ${isLocked ? 'bg-[#ddd] font-bold text-black' : 'bg-white text-blue-800'}
                                        ${isSelected ? 'bg-black text-white' : ''}
                                        ${borderR} ${borderB}
                                     `}
                                     style=${{ marginRight: (cIdx+1)%3===0 && cIdx!==8 ? '2px' : '0', marginBottom: (rIdx+1)%3===0 && rIdx!==8 ? '2px' : '0' }}
                                >
                                    ${cell !== 0 ? cell : ''}
                                </div>
                            `;
                        })
                    )}
                </div>

                <!-- CONTROLS -->
                <div className="flex gap-4 w-full">
                    <button onClick=${checkSolution} className="flex-1 btn-pixel text-xs">CHECK</button>
                    <button onClick=${onClose} className="flex-1 btn-pixel text-xs bg-black text-white hover:bg-red-600">EXIT</button>
                </div>
                
                <div className="mt-2 text-[10px] text-gray-500 font-mono">
                    CLICK CELL -> TYPE 1-9
                </div>
            </div>
        </div>
    `;
}