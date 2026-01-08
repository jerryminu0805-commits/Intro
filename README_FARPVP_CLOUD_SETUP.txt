FarPVP 云房间（跨设备可见）快速启用说明

为什么你现在在 Laptop 创建的房间，iPad 看不到？
- 旧版房间列表用的是 localStorage（本地浏览器存储），不同设备不会共享。

本版本已加入 Firebase Firestore 云房间：
- 不需要你自己写服务器
- 适合 GitHub Pages / 静态网页

启用步骤（约 3-5 分钟）：
1) 打开 Firebase Console，新建项目
2) Authentication -> Sign-in method -> 启用 Anonymous
3) Firestore Database -> Create database
4) Project settings -> Your apps (Web) -> 复制 config
5) 打开本项目：Menu 9/firebase-config.js
   把 window.GW_FIREBASE_CONFIG = null; 改成你的 config（示例就在文件里）

建议 Firestore Rules（先跑通，再收紧）：
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /farpvpRooms/{roomId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}

提示：
- 如果不填 firebase-config.js，游戏依旧可运行，但房间只在本设备可见（旧行为）。
