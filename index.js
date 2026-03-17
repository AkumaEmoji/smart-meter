var admin = require("firebase-admin");

const serviceAccount = require('./smart-meter-project-497ac-firebase-adminsdk-fbsvc-98a2a903d2.json');


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const SmartmeterObis = require('smartmeter-obis');
const path = require('path');
const Database = require('better-sqlite3');
const express = require('express');

// --- データベースの準備 ---
const db = new Database('sensor_data.db');
// index.js の初期化部分
db.prepare(`
    CREATE TABLE IF NOT EXISTS meter_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        active_power_w REAL,      -- 16.7.0 (瞬間電力)
        total_import_kwh REAL,   -- 1.8.0 (積算受電量)
        total_export_kwh REAL,   -- 2.8.0 (積算売電量)
        raw_data TEXT            -- 念のため全データをJSONで残す用
    )
`).run();

const options = {
    protocol: "SmlProtocol",
    transport: "SerialResponseTransport",
    transportSerialPort: "/dev/tty.usbserial-130", 
    transportSerialBaudrate: 9600,
    obisNameLanguage: 'en',
    obisFallbackMedium: 6
};

// --- APIサーバーの準備 (フロントエンド用) ---
const app = express();
// 1. 静的ファイルの場所を「現在のフォルダ」に固定する
app.use(express.static(path.join(__dirname)));

// 2. ルートパス (/) にアクセスした時に index.html を強制的に読み込む
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/api/data', (req, res) => {
    try {
        // readings ではなく meter_readings に変更！
        const data = db.prepare('SELECT * FROM meter_readings ORDER BY id DESC LIMIT 100').all();
        res.json(data);
    } catch (err) {
        console.error("API Error:", err);
        res.status(500).json({ error: err.message });
    }
});
app.listen(3000, () => console.log("API Server: http://localhost:3000"));

// --- データ受信時の処理 ---
// --- 1. 受信時の処理を少し修正 ---
function displayAndSaveData(err, obisResult) {
    if (err) return console.error(err);

    // 必要な値を抜き出す
    const power = obisResult['1-0:16.7.0*255']?.value || 0;
    const importKwh = obisResult['1-0:1.8.0*255']?.value || 0;
    const exportKwh = obisResult['1-0:2.8.0*255']?.value || 0;

    console.log(`保存中... 電力: ${power}W, 受電: ${importKwh}kWh`);

    // 1行にまとめて INSERT！
    const insert = db.prepare(`
        INSERT INTO meter_readings (active_power_w, total_import_kwh, total_export_kwh, raw_data)
        VALUES (?, ?, ?, ?)
    `);
    
    insert.run(power, importKwh, exportKwh, JSON.stringify(obisResult));

    // 次の受信待機
    smTransport.process();
}

// --- 2. 最初の1回目をキックする ---
const smTransport = SmartmeterObis.init(options, displayAndSaveData);
console.log("Starting Smart Meter Reading (Press Ctrl+C to stop)...");

// while(1) ではなく、これ一回でOK
smTransport.process();
// 1分間動かし続ける設定（テスト用に長めに変更）
// setTimeout(() => {
//     console.log("Stopping...");
//     smTransport.stop();
//     process.exit();
// }, 60000);