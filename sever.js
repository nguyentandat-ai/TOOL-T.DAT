const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 3000; // Bạn có thể đổi cổng nếu cần

// --- Cấu hình ---
const API_URL = 'https://api.wsktnus8.net/v2/history/getLastResult?gameId=ktrng_3979&size=100&tableId=39791215743193&curPage=1';
const UPDATE_INTERVAL = 5000; // Tự động cập nhật sau mỗi 5 giây (5000ms)

// Biến lưu trữ toàn bộ lịch sử, sẽ được tự động cập nhật
let historyData = [];

// --- Các hàm hỗ trợ ---

/**
 * Hàm gọi đến API gốc để lấy dữ liệu mới nhất
 */
async function fetchLatestData() {
    try {
        console.log('Đang lấy dữ liệu mới...');
        const response = await axios.get(API_URL);
        // Dữ liệu nằm trong response.data.data.resultList
        if (response.data && response.data.data && response.data.data.resultList) {
            return response.data.data.resultList;
        }
        return [];
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu từ API gốc:', error.message);
        return null; // Trả về null nếu có lỗi
    }
}

/**
 * Hàm cập nhật lịch sử dữ liệu
 * Chỉ thêm vào những phiên mới chưa có trong lịch sử
 */
async function updateHistory() {
    const newDataList = await fetchLatestData();

    if (!newDataList) {
        console.log('Không nhận được dữ liệu mới, bỏ qua cập nhật.');
        return;
    }
    
    // Nếu lịch sử đang trống, gán toàn bộ dữ liệu mới vào
    if (historyData.length === 0) {
        historyData = newDataList;
        console.log(`Đã khởi tạo lịch sử với ${historyData.length} phiên.`);
        return;
    }

    // Lấy gameNum của phiên mới nhất trong lịch sử hiện tại
    const latestKnownGameNum = historyData[0].gameNum;

    // Tìm vị trí của phiên này trong dữ liệu mới lấy về
    const lastKnownIndex = newDataList.findIndex(item => item.gameNum === latestKnownGameNum);

    // Nếu không tìm thấy (có thể do API reset), hoặc tìm thấy ngay đầu tiên (không có gì mới)
    if (lastKnownIndex <= 0) {
        if (lastKnownIndex === 0) console.log('Không có phiên mới.');
        if (lastKnownIndex === -1) console.log('Dữ liệu mới không chứa phiên đã biết, có thể API đã reset.');
        return;
    }

    // Lấy các phiên mới hơn (nằm trước phiên đã biết)
    const newEntries = newDataList.slice(0, lastKnownIndex);

    if (newEntries.length > 0) {
        // Thêm các phiên mới vào đầu mảng lịch sử
        historyData.unshift(...newEntries);
        console.log(`Đã cập nhật thêm ${newEntries.length} phiên mới. Tổng số phiên trong lịch sử: ${historyData.length}`);
    }
}

/**
 * Hàm chuyển đổi mili giây thành chuỗi thời gian định dạng YYYY-MM-DD HH:mm:ss
 */
function formatTimestamp(ms) {
    const date = new Date(ms);
    return date.toLocaleString('sv-SE'); // Định dạng 'sv-SE' cho ra 'YYYY-MM-DD HH:mm:ss'
}

/**
 * Hàm xác định kết quả là Tài hay Xỉu
 */
function getTaiXiu(score) {
    if (score >= 4 && score <= 10) return 'Xỉu';
    if (score >= 11 && score <= 17) return 'Tài';
    return 'N/A'; // Trường hợp bộ ba đồng nhất (3 hoặc 18) có thể có luật riêng
}


// --- API Endpoints ---

// Endpoint gốc: Hiển thị các route có sẵn
app.get('/', (req, res) => {
    const endpoints = {
        message: "Chào mừng bạn đến với Sunwin API. Dưới đây là các endpoint có sẵn:",
        available_endpoints: [
            {
                method: "GET",
                path: "/api/sunwin/sicbo",
                description: "Lấy kết quả phiên Sicbo (Tài Xỉu) mới nhất và thông tin phiên tiếp theo."
            },
            {
                method: "GET",
                path: "/api/sunwin/history",
                description: "Lấy toàn bộ lịch sử các phiên Sicbo đã được ghi lại từ khi server khởi động."
            }
        ]
    };
    res.json(endpoints);
});

// Endpoint 1: Lấy kết quả phiên mới nhất và phiên kế tiếp
app.get('/api/sunwin/sicbo', (req, res) => {
    if (historyData.length === 0) {
        return res.status(503).json({
            error: 'Dữ liệu đang được tải, vui lòng thử lại sau giây lát.'
        });
    }

    const latestResult = historyData[0]; // Lấy phiên mới nhất từ lịch sử đã được cập nhật

    // Tính toán phiên tiếp theo
    const currentGameNumStr = latestResult.gameNum.replace('#', '');
    const nextGameNum = parseInt(currentGameNumStr, 10) + 1;

    const response = {
        phien: latestResult.gameNum,
        xuc_xac: latestResult.facesList,
        tong_diem: latestResult.score,
        ket_qua: getTaiXiu(latestResult.score), // Tài hoặc Xỉu
        thoi_gian: formatTimestamp(latestResult.timeMilli),
        phien_tiep_theo: `#${nextGameNum}`
    };

    res.json(response);
});


// Endpoint 2: Lấy toàn bộ lịch sử đã được tích lũy
app.get('/api/sunwin/history', (req, res) => {
    if (historyData.length === 0) {
        return res.status(503).json({
            error: 'Dữ liệu đang được tải, vui lòng thử lại sau giây lát.'
        });
    }
    
    res.json({
        message: `Lịch sử được tự động cập nhật. Hiện có ${historyData.length} phiên.`,
        data: historyData
    });
});


// --- Khởi động Server ---
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);

    // Chạy cập nhật lần đầu tiên ngay khi server khởi động
    console.log('Đang lấy dữ liệu lần đầu...');
    updateHistory();

    // Thiết lập một vòng lặp để tự động cập nhật dữ liệu
    setInterval(updateHistory, UPDATE_INTERVAL);
});