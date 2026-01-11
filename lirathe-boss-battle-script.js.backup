// 2D Turn-Based RPG Demo - Old Love Unfinished (Lirathe Boss Battle)
// This is a placeholder implementation for the Lirathe boss battle
// TODO: Full implementation pending complete battle mechanics

// Map configuration
let ROWS = 9;
let COLS = 26;

// Display message
document.addEventListener('DOMContentLoaded', () => {
  const battleArea = document.getElementById('battleArea');
  if (battleArea) {
    battleArea.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #e6e6e6; text-align: center; flex-direction: column; padding: 40px;">
        <h2 style="font-size: 32px; margin-bottom: 20px; color: #d4a5d4;">旧情未了</h2>
        <p style="font-size: 18px; margin-bottom: 30px;">Lirathe - 赫雷西第五干部</p>
        <div style="max-width: 600px; line-height: 1.8;">
          <p style="margin-bottom: 15px;">这是一场特殊的战斗。</p>
          <p style="margin-bottom: 15px;">地图规格：9×26</p>
          <p style="margin-bottom: 15px;">Lirathe（利拉斯）位于 (5,5)</p>
          <p style="margin-bottom: 15px;">Karma 位于 (5,22)</p>
          <p style="margin-bottom: 30px;">第2回合时，Adora和Dario的虚影将出现。</p>
          <p style="font-style: italic; color: #a3a7b3;">Boss战机制正在开发中...</p>
          <br/>
          <button onclick="window.location.href='index.html'" style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 32px;
            font-size: 16px;
            border-radius: 8px;
            cursor: pointer;
            margin-top: 20px;
          ">返回关卡选择</button>
        </div>
      </div>
    `;
  }

  // Hide right panel
  const rightPanel = document.querySelector('.right');
  if (rightPanel) {
    rightPanel.style.display = 'none';
  }

  // Adjust app layout
  const app = document.querySelector('.app');
  if (app) {
    app.style.gridTemplateColumns = '1fr';
    app.style.justifyContent = 'center';
  }

  // Play BGM
  const bgm = document.getElementById('liratheBGM');
  if (bgm) {
    bgm.volume = 0.6;
    bgm.play().catch(() => {});
  }
});
