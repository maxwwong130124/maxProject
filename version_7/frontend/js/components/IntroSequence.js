import html from '../utils/html.js';
const { useState, useEffect } = React;

export default function IntroSequence({ onComplete }) {
    const [title, setTitle] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [extraText, setExtraText] = useState(""); // <--- New State
    const [bar, setBar] = useState("");
    
    // --- CONFIGURATION ---
    const TITLE_TEXT = "HERMES";
    const SUBTITLE_TEXT = "HEURISTIC ENCRYPTION MESSENGER"; 
    // The new long text
    const EXTRA_TEXT_CONTENT = "(or Hybrid Encrypted Relay & Messaging Exchange System, if you prefer a more complex name :))";

    useEffect(() => {
        let i = 0;
        let j = 0;
        let k = 0; // Iterator for extra text
        let loadingStarted = false;

        // 1. Type the TITLE
        const titleTimer = setInterval(() => {
            if (i < TITLE_TEXT.length) {
                setTitle(TITLE_TEXT.substring(0, i + 1));
                i++;
            } else {
                clearInterval(titleTimer);
                
                // 2. Type the SUBTITLE
                const subTimer = setInterval(() => {
                    if (j < SUBTITLE_TEXT.length) {
                        setSubtitle(SUBTITLE_TEXT.substring(0, j + 1));
                        j++;
                    } else {
                        clearInterval(subTimer);
                        if (!loadingStarted) startLoading();
                    }
                }, 30);
            }
        }, 150);

        // 3. The Loading Bar & Extra Text
        const startLoading = () => {
            loadingStarted = true;
            let percent = 0;
            
            // Start Typing Extra Text (Fast)
            const extraTimer = setInterval(() => {
                if (k < EXTRA_TEXT_CONTENT.length) {
                    setExtraText(EXTRA_TEXT_CONTENT.substring(0, k + 1));
                    k++;
                } else {
                    clearInterval(extraTimer);
                }
            }, 20); // 20ms per char to fit within loading time

            // Start Progress Bar
            const loadTimer = setInterval(() => {
                percent += 1; // Slower bar to allow text to read
                const totalBlocks = 20;
                const filled = Math.floor((percent / 100) * totalBlocks);
                const empty = totalBlocks - filled;
                
                setBar(`[${"█".repeat(filled)}${"_".repeat(empty)}] ${percent}%`);

                if (percent >= 100) {
                    clearInterval(loadTimer);
                    setTimeout(onComplete, 1500); // Wait a bit longer to read the joke
                }
            }, 50);
        };

        return () => {
            clearInterval(titleTimer);
        };
    }, []);

    return html`
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white text-black cursor-wait p-4">
            
            <div className="mb-8 text-center w-full max-w-4xl">
                <!-- MAIN TITLE -->
                <h1 className="text-6xl md:text-8xl mb-2 font-bold text-black" style=${{ fontFamily: '"Press Start 2P"' }}>
                    ${title}<span className="text-blink text-4xl">_</span>
                </h1>
                
                <!-- SUBTITLE -->
                <div className="h-8 mb-2"> 
                    <p className="text-sm md:text-xl font-mono font-bold text-gray-800 tracking-widest">
                        ${subtitle}
                    </p>
                </div>

                <!-- EXTRA TEXT (The Joke) -->
                <div className="h-8"> 
                    <p className="text-xs font-mono text-gray-500 italic">
                        ${extraText}
                    </p>
                </div>
            </div>

            <!-- LOADING BAR -->
            <div className="font-mono text-lg md:text-2xl bg-white px-4 py-2 border-4 border-black text-black shadow-[8px_8px_0px_#888] mt-2">
                ${bar || "[____________________] 0%"}
            </div>

            <!-- FOOTER STATUS -->
            <div className="mt-8 text-xs text-black font-mono font-bold opacity-60">
                > SYSTEM_INTEGRITY_CHECK... OK <br/>
                > INITIALIZING_WEBSOCKET... OK
            </div>
        </div>
    `;
}