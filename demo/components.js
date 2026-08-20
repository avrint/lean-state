leanState.config({ app: "media-app", scope: "app" });

    // =========================================================================
    // 2. Theme Toggle Component
    // =========================================================================
    class ThemeToggle extends HTMLElement {
      connectedCallback() {
        this.innerHTML = `
          <button class="p-2 px-4 rounded-full font-semibold shadow-md border 
                         bg-white text-gray-800 border-gray-300 hover:bg-gray-50
                         dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700
                         transition-colors duration-200">
            🌙
          </button>
        `;
        const btn = this.querySelector('button');

        // 1. Initialize from Persistent State
        const savedTheme = leanState.get("theme") || "dark";
        this.applyTheme(savedTheme, btn);

        // 2. Subscribe to real-time changes
        leanState.bus.subscribe("theme-change", (payload) => {
          this.applyTheme(payload.theme, btn);
          // broadcastLocalMessage("theme-change", payload);
        });

        // 3. User Interaction
        btn.addEventListener('click', () => {
          const isDark = document.documentElement.classList.contains('dark');
          const newTheme = isDark ? 'light' : 'dark';
          
          // Save to disk
          leanState.set("theme", newTheme, { persistence: "persistent" });
          // Broadcast to tabs
          leanState.bus.send("theme-change", { theme: newTheme });
        });
      }

      applyTheme(theme, btn) {
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
          btn.textContent = '☀︎';
        } else {
          document.documentElement.classList.remove('dark');
          btn.textContent = '☽';
        }
      }
    }
    customElements.define('theme-toggle', ThemeToggle);

    // =========================================================================
    // 3. Volume Slider Component
    // =========================================================================
    class VolumeSlider extends HTMLElement {
      connectedCallback() {
        this.innerHTML = `
          <div class="p-6 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-xl flex items-center space-x-4 border border-gray-200 dark:border-gray-700 transition-colors duration-200">
            <div class="flex-shrink-0 bg-indigo-100 dark:bg-indigo-900/50 p-2 rounded-full">
              <svg class="h-6 w-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10v4a2 2 0 002 2h2l5 5V3l-5 5H7a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div class="flex-1">
              <input type="range" id="volume" min="0" max="100" value="50" 
                     class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-400">
            </div>
            <span id="volume-display" class="text-sm font-bold text-gray-700 dark:text-gray-300 w-8 text-right">50%</span>
          </div>
        `;

        const input = this.querySelector('#volume');
        const display = this.querySelector('#volume-display');

        // 1. Initialize from Persistent State
        const savedVolume = leanState.get("volume");
        if (savedVolume !== undefined) {
          input.value = savedVolume;
          display.textContent = `${savedVolume}%`;
        }

        // 2. Subscribe to real-time changes
        leanState.bus.subscribe("volume-change", (payload) => {
          input.value = payload.level;
          display.textContent = `${payload.level}%`;
          // broadcastLocalMessage("volume-change", payload);
        });

        // 3. User Interaction
        input.addEventListener('input', (e) => {
          const level = e.target.value;
          
          // Save to disk
          leanState.set("volume", level, { persistence: "persistent" });
          // Broadcast to tabs
          leanState.bus.send("volume-change", { level: level });
        });
      }
    }
    customElements.define('volume-slider', VolumeSlider);