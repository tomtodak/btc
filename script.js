class MultiTimeframeBTCCalculator {
    constructor() {
        this.currentPrice = 0;
        this.timeframes = {
            daily: { high: 0, low: 0, close: 0, levels: {} },
            weekly: { high: 0, low: 0, close: 0, levels: {} },
            monthly: { high: 0, low: 0, close: 0, levels: {} }
        };
        this.currentTimeframe = 'daily';
        this.init();
    }
    
    async init() {
        await this.getCurrentPrice();
        await this.getAllTimeframeData();
        this.calculateAllLevels();
        this.updateAllDisplays();
        this.updateComparisonTable();
        this.startRealTimeUpdates();
    }
    
    async getCurrentPrice() {
        try {
            const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
            const data = await response.json();
            this.currentPrice = parseFloat(data.price);
            this.updateStatus('Current price loaded successfully', 'success');
        } catch (error) {
            this.updateStatus('Error loading current price', 'error');
        }
    }
    
    async getAllTimeframeData() {
        await Promise.all([
            this.getTimeframeData('daily', 1),
            this.getTimeframeData('weekly', 7),
            this.getTimeframeData('monthly', 30)
        ]);
    }
    
    async getTimeframeData(timeframe, days) {
        try {
            const now = new Date();
            let startDate, endDate;
            
            if (timeframe === 'daily') {
                // Semalam sahaja
                endDate = new Date(now);
                endDate.setDate(endDate.getDate() - 1);
                startDate = new Date(endDate);
            } else if (timeframe === 'weekly') {
                // 7 hari yang lalu (1-7 hari sebelum hari ini)
                endDate = new Date(now);
                endDate.setDate(endDate.getDate() - 7);
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 6); // 7 hari sebelum endDate
            } else if (timeframe === 'monthly') {
                // 30 hari yang lalu
                endDate = new Date(now);
                endDate.setDate(endDate.getDate() - 30);
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 29); // 30 hari sebelum endDate
            }
            
            // Get current price (close semasa)
            const currentPriceResponse = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
            const currentPriceData = await currentPriceResponse.json();
            const currentClose = parseFloat(currentPriceData.price);
            
            // Get historical klines untuk data dalam tempoh tersebut
            const klinesResponse = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&startTime=${startDate.getTime()}&endTime=${endDate.getTime()}&limit=1000`);
            const klinesData = await klinesResponse.json();
            
            // Get trades dalam tempoh tersebut
            const tradesResponse = await fetch('https://api.binance.com/api/v3/trades?symbol=BTCUSDT&limit=1000');
            const tradesData = await tradesResponse.json();
            
            // Filter trades untuk tempoh yang betul
            const timeframeTrades = tradesData.filter(trade => {
                const tradeTime = new Date(trade.time);
                return tradeTime >= startDate && tradeTime <= endDate;
            });
            
            // Calculate volume by price
            const priceVolume = {};
            timeframeTrades.forEach(trade => {
                const price = parseFloat(trade.price);
                const quantity = parseFloat(trade.qty);
                
                if (priceVolume[price]) {
                    priceVolume[price] += quantity;
                } else {
                    priceVolume[price] = quantity;
                }
            });
            
            // Find highest and lowest volume prices
            let maxVolume = 0;
            let minVolume = Infinity;
            let maxVolumePrice = 0;
            let minVolumePrice = 0;
            
            Object.keys(priceVolume).forEach(price => {
                const volume = priceVolume[price];
                if (volume > maxVolume) {
                    maxVolume = volume;
                    maxVolumePrice = parseFloat(price);
                }
                if (volume < minVolume && volume > 0) {
                    minVolume = volume;
                    minVolumePrice = parseFloat(price);
                }
            });
            
            // Use current close price for all timeframes
            this.timeframes[timeframe] = {
                high: maxVolumePrice,
                low: minVolumePrice,
                close: currentClose,
                startDate: startDate,
                endDate: endDate
            };
            
            this.updateDataInfo(timeframe);
            this.updateStatus(`${timeframe} data loaded successfully`, 'success');
            
        } catch (error) {
            this.updateStatus(`Error loading ${timeframe} data`, 'error');
        }
    }
    
    calculateAllLevels() {
        Object.keys(this.timeframes).forEach(timeframe => {
            this.calculateLevels(timeframe);
        });
    }
    
    calculateLevels(timeframe) {
        const { high, low, close } = this.timeframes[timeframe];
        
        // Pivot calculation
        const pivot = (high + low + close) / 3;
        
        // R1 and S1
        const r1 = (2 * pivot) - low;
        const s1 = (2 * pivot) - high;
        
        // Range
        const range = r1 - s1;
        
        // Calculate all levels
        this.timeframes[timeframe].levels = {
            r4: pivot + (range * 3),
            r3: pivot + (range * 2),
            r2: pivot + range,
            r1: r1,
            pivot: pivot,
            s1: s1,
            s2: pivot - range,
            s3: pivot - (range * 2),
            s4: pivot - (range * 3)
        };
    }
    
    updateAllDisplays() {
        // Update current price
        document.getElementById('currentPrice').textContent = `$${this.currentPrice.toFixed(2)}`;
        
        // Update all timeframes
        Object.keys(this.timeframes).forEach(timeframe => {
            this.updateTimeframeDisplay(timeframe);
        });
    }
    
    updateTimeframeDisplay(timeframe) {
        const levels = this.timeframes[timeframe].levels;
        
        Object.keys(levels).forEach(level => {
            const element = document.getElementById(`${timeframe}-${level}`);
            if (element) {
                element.textContent = `$${levels[level].toFixed(2)}`;
            }
        });
    }
    
    updateDataInfo(timeframe) {
        const dataInfo = document.getElementById(`${timeframe}DataInfo`);
        const data = this.timeframes[timeframe];
        
        const startStr = data.startDate.toLocaleDateString();
        const endStr = data.endDate.toLocaleDateString();
        
        dataInfo.innerHTML = `
            <div><strong>Period:</strong> ${startStr} - ${endStr}</div>
            <div><strong>High (Most Bought):</strong> $${data.high.toFixed(2)}</div>
            <div><strong>Low (Most Sold):</strong> $${data.low.toFixed(2)}</div>
            <div><strong>Close (Current):</strong> $${data.close.toFixed(2)}</div>
            <div><strong>Pivot:</strong> $${data.levels?.pivot?.toFixed(2) || 'Calculating...'}</div>
        `;
    }
    
    updateComparisonTable() {
        const tableBody = document.getElementById('comparisonTable');
        const levels = ['r4', 'r3', 'r2', 'r1', 'pivot', 's1', 's2', 's3', 's4'];
        
        let tableHTML = '';
        levels.forEach(level => {
            tableHTML += '<tr>';
            tableHTML += `<td><strong>${level.toUpperCase()}</strong></td>`;
            tableHTML += `<td>$${this.timeframes.daily.levels[level]?.toFixed(2) || '-'}</td>`;
            tableHTML += `<td>$${this.timeframes.weekly.levels[level]?.toFixed(2) || '-'}</td>`;
            tableHTML += `<td>$${this.timeframes.monthly.levels[level]?.toFixed(2) || '-'}</td>`;
            tableHTML += '</tr>';
        });
        
        tableBody.innerHTML = tableHTML;
    }
    
    updateStatus(message, type) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
    }
    
    startRealTimeUpdates() {
        // Update current price every 10 seconds
        setInterval(async () => {
            await this.getCurrentPrice();
            this.updateAllDisplays();
        }, 10000);
        
        // Update all timeframes every 5 minutes
        setInterval(async () => {
            await this.getAllTimeframeData();
            this.calculateAllLevels();
            this.updateAllDisplays();
            this.updateComparisonTable();
        }, 300000);
    }
}

// Global function for switching timeframes
function switchTimeframe(timeframe) {
    // Update tabs
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    // Update content
    document.querySelectorAll('.timeframe-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${timeframe}-content`).classList.add('active');
}

// Initialize the calculator when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const calculator = new MultiTimeframeBTCCalculator();
}); 