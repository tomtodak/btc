class MultiTimeframeBTCCalculator {
    constructor() {
        this.currentPrice = 0;
        this.timeframes = {
            daily: { high: 0, low: 0, close: 0, levels: {} },
            weekly: { high: 0, low: 0, close: 0, levels: {} },
            monthly: { high: 0, low: 0, close: 0, levels: {} }
        };
        this.currentTimeframe = 'daily';
        this.dataHistory = [];
        this.init();
    }
    
    async init() {
        await this.getCurrentPrice();
        await this.getAllTimeframeData();
        this.calculateAllLevels();
        this.updateAllDisplays();
        this.updateComparisonTable();
        this.startRealTimeUpdates();
        this.saveDataToJSON();
        
        // Update chart with initial data
        this.updateChart('daily');
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
            
            // Get trades dalam tempoh tersebut - increase limit untuk dapat lebih banyak data
            const tradesResponse = await fetch('https://api.binance.com/api/v3/trades?symbol=BTCUSDT&limit=2000');
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
            
            // Fallback: Jika volume data tidak cukup, gunakan klines data
            if (maxVolumePrice === 0 || minVolumePrice === 0) {
                console.log(`Using klines data for ${timeframe} - volume data insufficient`);
                
                let highPrice = 0;
                let lowPrice = Infinity;
                
                klinesData.forEach(kline => {
                    const high = parseFloat(kline[2]);
                    const low = parseFloat(kline[3]);
                    
                    if (high > highPrice) highPrice = high;
                    if (low < lowPrice) lowPrice = low;
                });
                
                maxVolumePrice = highPrice;
                minVolumePrice = lowPrice;
            }
            
            // Final fallback: Gunakan current price ± 5% jika masih zero
            if (maxVolumePrice === 0 || minVolumePrice === 0) {
                console.log(`Using current price fallback for ${timeframe}`);
                maxVolumePrice = currentClose * 1.05;
                minVolumePrice = currentClose * 0.95;
            }
            
            // Use current close price for all timeframes
            this.timeframes[timeframe] = {
                high: maxVolumePrice,
                low: minVolumePrice,
                close: currentClose,
                startDate: startDate,
                endDate: endDate,
                volumeData: priceVolume,
                trades: timeframeTrades // Simpan trades untuk chart
            };
            
            this.updateDataInfo(timeframe);
            this.updateStatus(`${timeframe} data loaded successfully`, 'success');
            
            // Update chart with new data
            this.updateChart(timeframe);
            
        } catch (error) {
            console.error(`Error loading ${timeframe} data:`, error);
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
        document.getElementById('currentPrice').textContent = window.formatPrice ? window.formatPrice(this.currentPrice) : `$${this.currentPrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
        
        // Update all timeframes
        Object.keys(this.timeframes).forEach(timeframe => {
            this.updateTimeframeDisplay(timeframe);
        });
        
        // Update summary tab
        this.updateSummaryTab();
    }
    
    updateTimeframeDisplay(timeframe) {
        const levels = this.timeframes[timeframe].levels;
        const data = this.timeframes[timeframe];

        // Fade-in animation for S/R cards
        const grid = document.querySelector(`#${timeframe}-content .levels-grid-new`);
        if (grid) {
            grid.classList.remove('fade-in');
            void grid.offsetWidth; // trigger reflow
            grid.classList.add('fade-in');
        }

        // Update S/R levels
        Object.keys(levels).forEach(level => {
            const element = document.getElementById(`${timeframe}-${level}`);
            if (element) {
                element.textContent = window.formatPrice ? window.formatPrice(levels[level]) : `$${levels[level].toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
            }
        });

        // Update pivot card with current price instead of pivot
        const pivotElement = document.getElementById(`${timeframe}-pivot`);
        if (pivotElement) {
            pivotElement.textContent = window.formatPrice ? window.formatPrice(this.currentPrice) : `$${this.currentPrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
        }

        // Update High, Low, Close
        const highEl = document.getElementById(`${timeframe}-high`);
        const lowEl = document.getElementById(`${timeframe}-low`);
        const closeEl = document.getElementById(`${timeframe}-close`);
        if (highEl) highEl.textContent = data.high ? (window.formatPrice ? window.formatPrice(data.high) : `$${data.high.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`) : '-';
        if (lowEl) lowEl.textContent = data.low ? (window.formatPrice ? window.formatPrice(data.low) : `$${data.low.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`) : '-';
        if (closeEl) closeEl.textContent = data.close ? (window.formatPrice ? window.formatPrice(data.close) : `$${data.close.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`) : '-';

        // Update suggestion
        this.updateSuggestion(timeframe);
    }
    
    updateSuggestion(timeframe) {
        const data = this.timeframes[timeframe];
        const levels = data.levels;
        const current = this.currentPrice;
        let suggestion = 'HOLD';
        let className = 'suggestion-hold';
        if (levels && data.high && data.low && data.close) {
            if (current <= levels.s1 * 1.01) {
                suggestion = 'BUY';
                className = 'suggestion-buy';
            } else if (current >= levels.r1 * 0.99) {
                suggestion = 'SELL';
                className = 'suggestion-sell';
            }
        }
        const suggestionBox = document.getElementById(`${timeframe}-suggestion`);
        if (suggestionBox) {
            // Pulse animation on change
            if (suggestionBox.textContent !== suggestion) {
                suggestionBox.classList.remove('pulse');
                void suggestionBox.offsetWidth;
                suggestionBox.classList.add('pulse');
            }
            suggestionBox.textContent = suggestion;
            suggestionBox.className = `suggestion-box ${className}`;
        }
    }
    
    updateDataInfo(timeframe) {
        const dataInfo = document.getElementById(`${timeframe}DataInfo`);
        const data = this.timeframes[timeframe];
        
        const startStr = data.startDate.toLocaleDateString();
        const endStr = data.endDate.toLocaleDateString();
        
        dataInfo.innerHTML = `
            <div><strong>Period:</strong> ${startStr} - ${endStr}</div>
            <div><strong>High (Most Bought):</strong> ${window.formatPrice ? window.formatPrice(data.high) : `$${data.high.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`}</div>
            <div><strong>Low (Most Sold):</strong> ${window.formatPrice ? window.formatPrice(data.low) : `$${data.low.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`}</div>
            <div><strong>Close (Current):</strong> ${window.formatPrice ? window.formatPrice(data.close) : `$${data.close.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`}</div>
            <div><strong>Pivot:</strong> ${window.formatPrice ? window.formatPrice(data.levels?.pivot) : `$${data.levels?.pivot?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}` || 'Calculating...'}</div>
        `;
    }
    
    updateChart(timeframe) {
        if (!btcChart) return;
        
        const data = this.timeframes[timeframe];
        if (!data || !data.trades) return;
        
        // Generate candlestick data from trades
        const candlestickData = btcChart.generateCandlestickData(data.trades, timeframe);
        
        // Get support and resistance levels
        const supportLevels = [
            data.levels?.s1 || 0,
            data.levels?.s2 || 0,
            data.levels?.s3 || 0,
            data.levels?.s4 || 0
        ].filter(level => level > 0);
        
        const resistanceLevels = [
            data.levels?.r1 || 0,
            data.levels?.r2 || 0,
            data.levels?.r3 || 0,
            data.levels?.r4 || 0
        ].filter(level => level > 0);
        
        // Update chart
        btcChart.setData(candlestickData, supportLevels, resistanceLevels, this.currentPrice, timeframe);
    }
    
    updateComparisonTable() {
        const tableBody = document.getElementById('comparisonTable');
        const levels = ['r4', 'r3', 'r2', 'r1', 'pivot', 's1', 's2', 's3', 's4'];
        
        let tableHTML = '';
        levels.forEach(level => {
            tableHTML += '<tr>';
            tableHTML += `<td><strong>${level.toUpperCase()}</strong></td>`;
            tableHTML += `<td>${window.formatPrice ? window.formatPrice(this.timeframes.daily.levels[level]) : `$${this.timeframes.daily.levels[level]?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}` || '-'}</td>`;
            tableHTML += `<td>${window.formatPrice ? window.formatPrice(this.timeframes.weekly.levels[level]) : `$${this.timeframes.weekly.levels[level]?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}` || '-'}</td>`;
            tableHTML += `<td>${window.formatPrice ? window.formatPrice(this.timeframes.monthly.levels[level]) : `$${this.timeframes.monthly.levels[level]?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}` || '-'}</td>`;
            tableHTML += '</tr>';
        });
        
        tableBody.innerHTML = tableHTML;
    }
    
    updateStatus(message, type) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
    }
    
    // JSON Data Storage Functions
    saveDataToJSON() {
        const dataToSave = {
            timestamp: new Date().toISOString(),
            currentPrice: this.currentPrice,
            timeframes: this.timeframes,
            metadata: {
                version: "1.0.0",
                description: "BTC Support & Resistance Calculator Data",
                generatedBy: "MultiTimeframeBTCCalculator"
            }
        };
        
        // Simpan ke localStorage untuk backup
        localStorage.setItem('btcCalculatorData', JSON.stringify(dataToSave));
        
        // Tambah ke history
        this.dataHistory.push(dataToSave);
        
        // Simpan history (max 100 entries)
        if (this.dataHistory.length > 100) {
            this.dataHistory = this.dataHistory.slice(-100);
        }
        
        localStorage.setItem('btcCalculatorHistory', JSON.stringify(this.dataHistory));
        
        console.log('Data saved to JSON:', dataToSave);
    }
    
    exportDataToFile() {
        const dataToExport = {
            timestamp: new Date().toISOString(),
            currentPrice: this.currentPrice,
            timeframes: this.timeframes,
            history: this.dataHistory,
            metadata: {
                version: "1.0.0",
                description: "BTC Support & Resistance Calculator Data Export",
                generatedBy: "MultiTimeframeBTCCalculator",
                exportDate: new Date().toISOString()
            }
        };
        
        const dataStr = JSON.stringify(dataToExport, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `btc-calculator-data-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        this.updateStatus('Data exported to JSON file successfully', 'success');
    }
    
    loadDataFromJSON(jsonData) {
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            
            if (data.timeframes) {
                this.timeframes = data.timeframes;
                this.currentPrice = data.currentPrice || 0;
                
                // Update displays
                this.updateAllDisplays();
                this.updateComparisonTable();
                
                // Update data info for each timeframe
                Object.keys(this.timeframes).forEach(timeframe => {
                    this.updateDataInfo(timeframe);
                });
                
                this.updateStatus('Data loaded from JSON successfully', 'success');
                return true;
            } else {
                throw new Error('Invalid data format');
            }
        } catch (error) {
            this.updateStatus('Error loading data from JSON', 'error');
            return false;
        }
    }
    
    getDataSummary() {
        const summary = {
            currentPrice: this.currentPrice,
            daily: {
                pivot: this.timeframes.daily.levels?.pivot || 0,
                r1: this.timeframes.daily.levels?.r1 || 0,
                s1: this.timeframes.daily.levels?.s1 || 0
            },
            weekly: {
                pivot: this.timeframes.weekly.levels?.pivot || 0,
                r1: this.timeframes.weekly.levels?.r1 || 0,
                s1: this.timeframes.weekly.levels?.s1 || 0
            },
            monthly: {
                pivot: this.timeframes.monthly.levels?.pivot || 0,
                r1: this.timeframes.monthly.levels?.r1 || 0,
                s1: this.timeframes.monthly.levels?.s1 || 0
            },
            timestamp: new Date().toISOString()
        };
        
        return summary;
    }
    
    startRealTimeUpdates() {
        // Update current price every 10 seconds
        setInterval(async () => {
            await this.getCurrentPrice();
            this.updateAllDisplays();
            this.saveDataToJSON(); // Simpan data setiap update
        }, 10000);
        
        // Update all timeframes every 5 minutes
        setInterval(async () => {
            await this.getAllTimeframeData();
            this.calculateAllLevels();
            this.updateAllDisplays();
            this.updateComparisonTable();
            this.saveDataToJSON(); // Simpan data setiap update
            // Notify chart to update S/R lines
            window.dispatchEvent(new Event('updateChartLevels'));
        }, 300000);
    }
    
    updateSummaryTab() {
        const timeframes = ['daily', 'weekly', 'monthly'];
        timeframes.forEach(tf => {
            const data = this.timeframes[tf];
            const levels = data.levels;
            let srSuggestion = '-', vtSuggestion = '-', taSuggestion = '-';
            let taTarget = '';
            let hvSuggestion = '-';
            let info = '';
            if (levels && data.high && data.low && data.close) {
                const current = this.currentPrice;

                // SR suggestion
                if (current <= levels.s1 * 1.01) {
                    srSuggestion = 'BUY';
                } else if (current >= levels.r1 * 0.99) {
                    srSuggestion = 'SELL';
                } else {
                    srSuggestion = 'HOLD';
                }

                // VT suggestion
                if (Math.abs(current - data.high) < Math.abs(current - data.low)) {
                    if (Math.abs(current - data.high) < 1) {
                        vtSuggestion = 'HOLD';
                    } else if (data.high > current) {
                        vtSuggestion = 'LOCK PROFIT';
                    } else {
                        vtSuggestion = 'BUY';
                    }
                } else {
                    if (data.low > current) {
                        vtSuggestion = 'SELL';
                    } else {
                        vtSuggestion = 'BUY';
                    }
                }

                // HV suggestion (High Volume Signal)
                let highVolumeBuy = data.volumeData?.[data.high]?.buy || 0;
                let highVolumeSell = data.volumeData?.[data.low]?.sell || 0;
                if (highVolumeBuy > highVolumeSell) {
                    hvSuggestion = 'BUY';
                } else if (highVolumeSell > highVolumeBuy) {
                    hvSuggestion = 'SELL';
                } else {
                    hvSuggestion = 'HOLD';
                }

                // Combine TA logic
                const signals = [srSuggestion, vtSuggestion, hvSuggestion];
                const buyCount = signals.filter(s => s.includes('BUY')).length;
                const sellCount = signals.filter(s => s.includes('SELL')).length;
                if (buyCount >= 2) taSuggestion = 'BUY';
                else if (sellCount >= 2) taSuggestion = 'SELL';
                else taSuggestion = 'HOLD';

                // Next target/support untuk TA (guna formatPrice)
                if (taSuggestion === 'HOLD' || taSuggestion === 'CAUTION') {
                    taTarget = `
                        <div class='next-target' style='margin-bottom:0;'>Next Target: R1 <b>${window.formatPrice ? window.formatPrice(levels.r1) : levels.r1}</b></div>
                        <div class='next-target last-next-target'>Next Support: S1 <b>${window.formatPrice ? window.formatPrice(levels.s1) : levels.s1}</b></div>
                    `;
                } else if (taSuggestion.includes('BUY')) {
                    taTarget = `<div class='next-target last-next-target'>Next Target: R1 <b>${window.formatPrice ? window.formatPrice(levels.r1) : levels.r1}</b></div>`;
                } else if (taSuggestion.includes('SELL') || taSuggestion === 'LOCK PROFIT') {
                    taTarget = `<div class='next-target last-next-target'>Next Support: S1 <b>${window.formatPrice ? window.formatPrice(levels.s1) : levels.s1}</b></div>`;
                }

                info = `
                    ${taTarget}
                    <div><b>SR</b>: ${srSuggestion}</div>
                    <div><b>VT</b>: ${vtSuggestion}</div>
                    <div><b>HV</b>: ${hvSuggestion}</div>
                    <div style="margin-top:8px;">Current Price: <b>${window.formatPrice ? window.formatPrice(current) : current}</b></div>
                    <div>Most Bought: <b>${window.formatPrice ? window.formatPrice(data.high) : data.high}</b></div>
                    <div>Most Sold: <b>${window.formatPrice ? window.formatPrice(data.low) : data.low}</b></div>
                `;
            }
            // Papar TA sahaja di bold putih
            document.getElementById(`summary-${tf}-suggestion`).textContent = taSuggestion;
            // Papar next target/support TA di bawah, kemudian SR & VT & HV, kemudian info harga
            document.getElementById(`summary-${tf}-info`).innerHTML = info;
        });
    }
}

// Tab switching functionality
document.addEventListener('DOMContentLoaded', function() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const chartCanvas = document.getElementById('btcChart');
    const summaryCards = document.getElementById('summary-cards-wrapper');
    const converterWrapper = document.getElementById('converter-wrapper');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const timeframe = this.getAttribute('data-timeframe');
            // Remove active class from all buttons and content
            tabButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.timeframe-content').forEach(content => content.classList.remove('active'));
            // Add active class to clicked button and corresponding content
            this.classList.add('active');
            const contentDiv = document.getElementById(timeframe + '-content');
            if (contentDiv) contentDiv.classList.add('active');
            // Show/hide chart, summary, converter
            if (timeframe === 'summary') {
                if (chartCanvas) chartCanvas.style.display = 'none';
                if (summaryCards) summaryCards.style.display = 'block';
                if (converterWrapper) converterWrapper.style.display = 'none';
            } else if (timeframe === 'converter') {
                if (chartCanvas) chartCanvas.style.display = 'none';
                if (summaryCards) summaryCards.style.display = 'none';
                if (converterWrapper) converterWrapper.style.display = 'block';
            } else {
                if (chartCanvas) chartCanvas.style.display = 'block';
                if (summaryCards) summaryCards.style.display = 'none';
                if (converterWrapper) converterWrapper.style.display = 'none';
            }
            // Update current timeframe in calculator
            if (window.calculator) {
                window.calculator.currentTimeframe = timeframe;
            }
            // Update chart with new timeframe
            updateChartWithTimeframe(timeframe);
            // Update currency displays for the new tab
            updateAllCurrencyDisplays();
        });
    });
});

function updateChartWithTimeframe(timeframe) {
    // Prevent chart update if calculator tab is active
    if (timeframe === 'calculator') return;
    // Update chart S/R lines based on selected timeframe
    if (window.btcChart && window.calculator) {
        // Update current timeframe
        window.calculator.currentTimeframe = timeframe;
        
        // Get new levels for the selected timeframe
        const newLevels = window.calculator.timeframes[timeframe]?.levels || {};
        
        // Update chart levels and redraw only S/R lines (faster)
        window.btcChart.levels = newLevels;
        window.btcChart.updateSRLinesOnly();
        
        console.log(`Updated chart with ${timeframe} levels:`, newLevels);
    }
}

// Global functions for JSON operations
function exportData() {
    if (window.calculator) {
        window.calculator.exportDataToFile();
    }
}

function loadDataFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                if (window.calculator) {
                    window.calculator.loadDataFromJSON(e.target.result);
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

function getDataSummary() {
    if (window.calculator) {
        const summary = window.calculator.getDataSummary();
        console.log('Data Summary:', summary);
        return summary;
    }
}

// ===== Converter Tab Logic =====
let converterRates = {
    USD: 1,
    MYR: null,
    CNY: null,
    IDR: null
};

async function fetchConverterRates() {
    try {
        console.log('Fetching exchange rates...');
        const res = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=MYR,CNY,IDR');
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        console.log('Exchange rates response:', data);
        
        if (data.success === false) {
            throw new Error(data.error?.info || 'API returned error');
        }
        
        converterRates.MYR = data.rates.MYR;
        converterRates.CNY = data.rates.CNY;
        converterRates.IDR = data.rates.IDR;
        window.converterRates = converterRates; // <-- ensure global
        
        console.log('Rates loaded:', converterRates);
        updateConverterRateInfo();
        
    } catch (error) {
        console.error('Exchange rate fetch error:', error);
        
        // Use fallback rates
        converterRates.MYR = 4.25;
        converterRates.CNY = 7.20;
        converterRates.IDR = 15800;
        window.converterRates = converterRates; // <-- ensure global fallback
        
        document.getElementById('converter-rate-info').innerHTML = 
            'Using fallback rates (live rates unavailable)<br>' +
            '<small>1 USD = 4.25 MYR | 7.20 CNY | 15,800 IDR</small>';
    }
}

function updateConverterRateInfo() {
    const info = document.getElementById('converter-rate-info');
    info.innerHTML =
        `1 USD = <b>${converterRates.MYR?.toLocaleString(undefined, {maximumFractionDigits:4}) || '-'}</b> MYR | ` +
        `<b>${converterRates.CNY?.toLocaleString(undefined, {maximumFractionDigits:4}) || '-'}</b> CNY | ` +
        `<b>${converterRates.IDR?.toLocaleString(undefined, {maximumFractionDigits:2}) || '-'}</b> IDR`;
}

function formatConv(val, decimals=8) {
    if (!val && val !== 0) return '';
    if (Math.abs(val) >= 1) return val.toLocaleString(undefined, {maximumFractionDigits:2});
    return val.toFixed(decimals).replace(/\.0+$/, '');
}

// Update converter logic untuk single input
function setupConverterEvents() {
    const btcInput = document.getElementById('conv-btc-main');
    
    btcInput.addEventListener('input', function() {
        const btcAmount = parseFloat(this.value) || 0;
        const currentPrice = window.calculator?.currentPrice || 0;
        
        if (!converterRates.MYR || !converterRates.CNY || !converterRates.IDR) return;
        
        const usdValue = btcAmount * currentPrice;
        const myrValue = usdValue * converterRates.MYR;
        const cnyValue = usdValue * converterRates.CNY;
        const idrValue = usdValue * converterRates.IDR;
        
        // Update cards
        document.getElementById('conv-usd-main').textContent = `$${formatConv(usdValue, 2)}`;
        document.getElementById('conv-myr-main').textContent = `RM ${formatConv(myrValue, 2)}`;
        document.getElementById('conv-cny-main').textContent = `¥${formatConv(cnyValue, 2)}`;
        document.getElementById('conv-idr-main').textContent = `Rp ${formatConv(idrValue, 0)}`;
    });
}

// ===== Currency System =====
let currentCurrency = 'USD';
let currencyRates = {
    USD: 1,
    MYR: null
};

// Make currency variables globally accessible for chart
window.currentCurrency = currentCurrency;
window.currencyRates = currencyRates;

async function fetchCurrencyRates() {
    try {
        const res = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=MYR');
        const data = await res.json();
        currencyRates.MYR = data.rates.MYR;
        // Update global currency rates for chart
        window.currencyRates = currencyRates;
        console.log('Currency rates loaded:', currencyRates);
    } catch (error) {
        console.error('Failed to fetch currency rates:', error);
        // Fallback rates
        currencyRates.MYR = 4.25;
        // Update global currency rates for chart
        window.currencyRates = currencyRates;
    }
}

function formatPrice(price, currency = currentCurrency) {
    if (!price && price !== 0) return '-';
    let formattedPrice;
    if (currency === 'USD') {
        formattedPrice = `$${price.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    } else if (currency === 'MYR') {
        if (!currencyRates.MYR) return '-';
        const myrPrice = price * currencyRates.MYR;
        formattedPrice = `RM ${myrPrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    } else if (currency === 'CNY') {
        if (!window.converterRates || !window.converterRates.CNY) return '-';
        const cnyPrice = price * window.converterRates.CNY;
        formattedPrice = `¥${cnyPrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    } else if (currency === 'IDR') {
        if (!window.converterRates || !window.converterRates.IDR) return '-';
        const idrPrice = price * window.converterRates.IDR;
        formattedPrice = `Rp ${idrPrice.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    } else {
        formattedPrice = price.toLocaleString(undefined, {maximumFractionDigits:2});
    }
    return formattedPrice;
}

// Make formatPrice globally accessible
window.formatPrice = formatPrice;

function updateAllCurrencyDisplays() {
    // Update current price display
    const currentPriceEl = document.getElementById('currentPrice');
    if (currentPriceEl && window.calculator) {
        currentPriceEl.textContent = formatPrice(window.calculator.currentPrice);
    }
    
    // Update all S/R levels for all timeframes
    ['daily', 'weekly', 'monthly'].forEach(timeframe => {
        const levels = window.calculator?.timeframes[timeframe]?.levels;
        if (levels) {
            ['r4', 'r3', 'r2', 'r1', 's1', 's2', 's3', 's4'].forEach(level => {
                const element = document.getElementById(`${timeframe}-${level}`);
                if (element && levels[level]) {
                    element.textContent = formatPrice(levels[level]);
                }
            });
            
            // Update pivot (current price)
            const pivotElement = document.getElementById(`${timeframe}-pivot`);
            if (pivotElement && window.calculator) {
                pivotElement.textContent = formatPrice(window.calculator.currentPrice);
            }
        }
        
        // Update high, low, close
        const data = window.calculator?.timeframes[timeframe];
        if (data) {
            const highEl = document.getElementById(`${timeframe}-high`);
            const lowEl = document.getElementById(`${timeframe}-low`);
            const closeEl = document.getElementById(`${timeframe}-close`);
            
            if (highEl && data.high) highEl.textContent = formatPrice(data.high);
            if (lowEl && data.low) lowEl.textContent = formatPrice(data.low);
            if (closeEl && data.close) closeEl.textContent = formatPrice(data.close);
        }
    });
    
    // Update comparison table
    updateComparisonTableCurrency();
    
    // Update summary tab
    updateSummaryTabCurrency();
    
    // Update chart if it exists and is visible
    if (window.btcChart && window.calculator) {
        const currentTimeframe = window.calculator.currentTimeframe;
        if (currentTimeframe && currentTimeframe !== 'summary' && currentTimeframe !== 'converter') {
            // Redraw chart with updated currency
            window.btcChart.draw();
        }
    }
}

function updateComparisonTableCurrency() {
    const tableBody = document.getElementById('comparisonTable');
    if (!tableBody) return;
    
    const levels = ['r4', 'r3', 'r2', 'r1', 'pivot', 's1', 's2', 's3', 's4'];
    
    let tableHTML = '';
    levels.forEach(level => {
        tableHTML += '<tr>';
        tableHTML += `<td><strong>${level.toUpperCase()}</strong></td>`;
        tableHTML += `<td>${formatPrice(window.calculator?.timeframes.daily.levels[level]) || '-'}</td>`;
        tableHTML += `<td>${formatPrice(window.calculator?.timeframes.weekly.levels[level]) || '-'}</td>`;
        tableHTML += `<td>${formatPrice(window.calculator?.timeframes.monthly.levels[level]) || '-'}</td>`;
        tableHTML += '</tr>';
    });
    
    tableBody.innerHTML = tableHTML;
}

function updateSummaryTabCurrency() {}

// Currency toggle event listeners
function setupCurrencyToggle() {
    const currencyButtons = document.querySelectorAll('.currency-btn');
    console.log('Found currency buttons:', currencyButtons.length);
    
    if (currencyButtons.length === 0) {
        console.error('No currency buttons found!');
        return;
    }
    
    currencyButtons.forEach((button, index) => {
        console.log(`Button ${index}:`, button.getAttribute('data-currency'));
        button.addEventListener('click', function() {
            const newCurrency = this.getAttribute('data-currency');
            console.log('Currency button clicked:', newCurrency);
            
            // Remove active class from all currency buttons
            currencyButtons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            this.classList.add('active');
            
            // Update currency if different
            if (newCurrency !== currentCurrency) {
                console.log('Changing currency from', currentCurrency, 'to', newCurrency);
                currentCurrency = newCurrency;
                
                // Update global currency variables for chart
                window.currentCurrency = currentCurrency;
                window.currencyRates = currencyRates;
                
                // Update global formatPrice function
                window.formatPrice = formatPrice;
                
                // Update all displays with new currency
                updateAllCurrencyDisplays();
                updateConverterRateInfo();
                
                console.log('Currency updated and displays refreshed');
            }
        });
    });
}

// Setup currency toggle when DOM is loaded
document.addEventListener('DOMContentLoaded', setupCurrencyToggle);

// Function to update currency button states (using same approach as tab buttons)
function updateCurrencyButtonStates() {
    const currencyButtons = document.querySelectorAll('.currency-btn');
    currencyButtons.forEach(button => {
        const buttonCurrency = button.getAttribute('data-currency');
        if (buttonCurrency === currentCurrency) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

// --- S/R Target Price in Converter Cards ---
function renderSRTargetInConverter() {
    // Use daily timeframe for S/R target (can be changed to weekly/monthly if needed)
    const tf = 'daily';
    const data = window.calculator?.timeframes?.[tf];
    if (!data || !data.levels) return;
    const levels = data.levels;
    const current = window.calculator?.currentPrice || 0;
    // Get BTC input value
    const btcInput = document.getElementById('conv-btc-main');
    const btcAmount = btcInput ? parseFloat(btcInput.value) || 0 : 0;
    // Get S/R target info from TA logic (same as summary tab)
    let srTargets = [];
    // Next Target & Next Support logic (from summary)
    let taSuggestion = '-';
    if (current <= levels.s1 * 1.01) taSuggestion = 'BUY';
    else if (current >= levels.r1 * 0.99) taSuggestion = 'SELL';
    else taSuggestion = 'HOLD';
    if (taSuggestion === 'HOLD' || taSuggestion === 'CAUTION') {
        srTargets.push({ label: 'Potential Gain', value: levels.r1, multiply: true });
        srTargets.push({ label: 'Potential Risk', value: levels.s1, multiply: true });
    } else if (taSuggestion.includes('BUY')) {
        srTargets.push({ label: 'Potential Gain', value: levels.r1, multiply: true });
    } else if (taSuggestion.includes('SELL') || taSuggestion === 'LOCK PROFIT') {
        srTargets.push({ label: 'Potential Risk', value: levels.s1, multiply: true });
    }
    srTargets.push({ label: 'Current Price', value: current, multiply: false });
    srTargets.push({ label: 'Most Bought', value: data.high, multiply: false });
    srTargets.push({ label: 'Most Sold', value: data.low, multiply: false });
    // Multiply only those with multiply: true by BTC input
    const srTargetsWithAmount = srTargets.map(tgt => ({
        label: tgt.label,
        value: tgt.multiply ? tgt.value * btcAmount : tgt.value
    }));
    // Calculate delta for Potential Gain/Risk
    const mainTargets = [];
    if (btcAmount > 0) {
        // Potential Gain
        if (typeof levels.r1 === 'number' && !isNaN(levels.r1)) {
            const gain = (levels.r1 - current) * btcAmount;
            mainTargets.push({
                label: 'Potential Gain',
                value: gain,
                className: 'sr-gain', // always green
                sign: gain >= 0 ? '+' : ''
            });
        }
        // Potential Risk
        if (typeof levels.s1 === 'number' && !isNaN(levels.s1)) {
            const risk = (current - levels.s1) * btcAmount;
            mainTargets.push({
                label: 'Potential Risk',
                value: risk,
                className: 'sr-risk', // always red
                sign: '-' // always minus
            });
        }
    } else {
        mainTargets.push({ label: 'Potential Gain', value: null, className: '', sign: '' });
        mainTargets.push({ label: 'Potential Risk', value: null, className: '', sign: '' });
    }
    // Info section (unchanged)
    const infoTargets = srTargetsWithAmount.filter(tgt => tgt.label === 'Current Price' || tgt.label === 'Most Bought' || tgt.label === 'Most Sold');
    // Render for each converter card
    const currencies = [
        { id: 'usd', symbol: 'USD', format: v => formatPrice(v, 'USD') },
        { id: 'myr', symbol: 'MYR', format: v => formatPrice(v, 'MYR') },
        { id: 'cny', symbol: 'CNY', format: v => formatPrice(v, 'CNY') },
        { id: 'idr', symbol: 'IDR', format: v => formatPrice(v, 'IDR') },
    ];
    currencies.forEach(cur => {
        const el = document.getElementById(`sr-target-${cur.id}`);
        if (!el) return;
        let html = '<ul>';
        mainTargets.forEach(tgt => {
            if (tgt.value === null) {
                html += `<li><span class='sr-label'>${tgt.label}:</span> <span class='sr-value'>-</span></li>`;
            } else {
                html += `<li><span class='sr-label'>${tgt.label}:</span> <span class='sr-value ${tgt.className}'>${tgt.sign}${cur.format(Math.abs(tgt.value))}</span></li>`;
            }
        });
        html += '</ul>';
        html += '<ul class="sr-target-list-info">';
        infoTargets.forEach(tgt => {
            html += `<li><span class='sr-label'>${tgt.label}:</span> <span class='sr-value'>${cur.format(tgt.value)}</span></li>`;
        });
        html += '</ul>';
        el.innerHTML = html;
    });
}
// Call on load and on currency/BTC input change
if (typeof window !== 'undefined') {
    window.renderSRTargetInConverter = renderSRTargetInConverter;
    document.addEventListener('DOMContentLoaded', renderSRTargetInConverter);
}
// Patch into updateAllCurrencyDisplays and converter BTC input
const origUpdateAllCurrencyDisplays = window.updateAllCurrencyDisplays;
window.updateAllCurrencyDisplays = function() {
    origUpdateAllCurrencyDisplays && origUpdateAllCurrencyDisplays();
    renderSRTargetInConverter();
};
// If converter BTC input changes, also update S/R
const btcInput = document.getElementById('conv-btc-main');
if (btcInput) {
    btcInput.addEventListener('input', renderSRTargetInConverter);
}

function updateConverterTASuggestion() {
    const timeframes = ['daily', 'weekly', 'monthly'];
    const labels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
    timeframes.forEach(tf => {
        const data = window.calculator?.timeframes?.[tf];
        const el = document.getElementById(`converter-ta-${tf}`);
        if (!data || !data.levels || !el) return;
        const levels = data.levels;
        const current = window.calculator?.currentPrice || 0;
        let srSuggestion = '-', vtSuggestion = '-', hvSuggestion = '-', taSuggestion = '-';
        // SR suggestion
        if (current <= levels.s1 * 1.01) {
            srSuggestion = 'BUY';
        } else if (current >= levels.r1 * 0.99) {
            srSuggestion = 'SELL';
        } else {
            srSuggestion = 'HOLD';
        }
        // VT suggestion (ikut summary logic)
        if (Math.abs(current - data.high) < Math.abs(current - data.low)) {
            if (Math.abs(current - data.high) < 1) {
                vtSuggestion = 'HOLD';
            } else if (data.high > current) {
                vtSuggestion = 'LOCK PROFIT';
            } else {
                vtSuggestion = 'BUY';
            }
        } else {
            if (data.low > current) {
                vtSuggestion = 'SELL';
            } else {
                vtSuggestion = 'BUY';
            }
        }
        // HV suggestion (ikut summary logic)
        let highVolumeBuy = data.volumeData?.[data.high]?.buy || 0;
        let highVolumeSell = data.volumeData?.[data.low]?.sell || 0;
        if (highVolumeBuy > highVolumeSell) {
            hvSuggestion = 'BUY';
        } else if (highVolumeSell > highVolumeBuy) {
            hvSuggestion = 'SELL';
        } else {
            hvSuggestion = 'HOLD';
        }
        // Combine TA logic (majority)
        const signals = [srSuggestion, vtSuggestion, hvSuggestion];
        const buyCount = signals.filter(s => s.includes('BUY')).length;
        const sellCount = signals.filter(s => s.includes('SELL')).length;
        if (buyCount >= 2) taSuggestion = 'BUY';
        else if (sellCount >= 2) taSuggestion = 'SELL';
        else taSuggestion = 'HOLD';
        let className = '';
        if (taSuggestion === 'BUY') className = 'converter-ta-buy';
        else if (taSuggestion === 'SELL') className = 'converter-ta-sell';
        else className = 'converter-ta-hold';
        el.innerHTML = `<div class='converter-ta-suggestion-row'><div class='converter-ta-label'>${labels[tf]}</div><div class='converter-ta-value ${className}'>${taSuggestion}</div></div>`;
    });
}
// Call on load and whenever BTC input or price changes
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', updateConverterTASuggestion);
}
const origRenderSRTargetInConverter = window.renderSRTargetInConverter;
window.renderSRTargetInConverter = function() {
    origRenderSRTargetInConverter && origRenderSRTargetInConverter();
    updateConverterTASuggestion();
};
const btcInput2 = document.getElementById('conv-btc-main');
if (btcInput2) {
    btcInput2.addEventListener('input', updateConverterTASuggestion);
}

// === Calculator Tab Logic (NEW, like converter) ===
function updateCalculatorTab() {
    // Get input values
    const btcInput = document.getElementById('calc-btc-main');
    const sellInput = document.getElementById('calc-sell-btc');
    const entryInput = document.getElementById('calc-entry-price');
    const btcAmount = parseFloat(btcInput?.value) || 0;
    const sellAmount = Math.min(parseFloat(sellInput?.value) || 0, btcAmount);
    const entryPrice = parseFloat(entryInput?.value) || 0;
    const balanceBtc = Math.max(btcAmount - sellAmount, 0);

    // Helper for price conversion (use only window.converterRates for all except USD)
    const getPrice = (base, cur) => {
        if (cur === 'USD') return base;
        if (cur === 'MYR') return base * (window.converterRates?.MYR || 0);
        if (cur === 'CNY') return base * (window.converterRates?.CNY || 0);
        if (cur === 'IDR') return base * (window.converterRates?.IDR || 0);
        return base;
    };
    // Use formatConv for consistency with converter tab
    const format = (v, cur) => {
        if (cur === 'USD') return `$${formatConv(v, 2)}`;
        if (cur === 'MYR') return `RM ${formatConv(v, 2)}`;
        if (cur === 'CNY') return `¥${formatConv(v, 2)}`;
        if (cur === 'IDR') return `Rp ${formatConv(v, 0)}`;
        return v.toLocaleString();
    };

    // Get current price (USD base)
    const currentPriceUSD = window.calculator?.currentPrice || 0;
    // Get daily S/R levels (USD base)
    const levels = window.calculator?.timeframes?.daily?.levels || {};
    const data = window.calculator?.timeframes?.daily || {};

    // For each currency card
    const currencies = [
        { id: 'usd', symbol: 'USD', icon: '💵', label: 'US Dollar' },
        { id: 'myr', symbol: 'MYR', icon: '🇲🇾', label: 'Malaysian Ringgit' },
        { id: 'cny', symbol: 'CNY', icon: '🇨🇳', label: 'Chinese Yuan' },
        { id: 'idr', symbol: 'IDR', icon: '🇮🇩', label: 'Indonesian Rupiah' },
    ];
    currencies.forEach(cur => {
        // Current price, entry price, etc. in this currency
        const currentPrice = getPrice(currentPriceUSD, cur.symbol);
        const entryPriceCur = getPrice(entryPrice, cur.symbol);
        const r1 = getPrice(levels.r1 || 0, cur.symbol);
        const s1 = getPrice(levels.s1 || 0, cur.symbol);
        const high = getPrice(data.high || 0, cur.symbol);
        const low = getPrice(data.low || 0, cur.symbol);
        // Output elements
        const profitEl = document.getElementById(`calc-${cur.id}-profit`);
        const srTargetEl = document.getElementById(`calc-sr-target-${cur.id}`);
        // Calculations
        const totalCost = entryPriceCur * btcAmount;
        const currentValue = currentPrice * sellAmount;
        const profitLoss = (currentPrice - entryPriceCur) * sellAmount;
        // Main profit/loss output
        let profitText = '';
        let profitClass = '';
        if (sellAmount > 0) {
            profitText = `${profitLoss >= 0 ? '+' : ''}${format(profitLoss, cur.symbol)}`;
            profitClass = profitLoss > 0 ? 'positive' : (profitLoss < 0 ? 'negative' : '');
        } else {
            profitText = '-';
            profitClass = '';
        }
        profitEl.textContent = profitText;
        profitEl.classList.remove('positive', 'negative');
        if (profitClass) profitEl.classList.add(profitClass);
        // S/R target section (match converter tab layout)
        let srHtml = '';
        srHtml += '<ul class="sr-target-list-info">';
        srHtml += `<li><span class='sr-label'>Current Price:</span> <span class='sr-value'>${format(currentPrice, cur.symbol)}</span></li>`;
        srHtml += `<li><span class='sr-label'>Next Target:</span> <span class='sr-value'>${format(r1, cur.symbol)}</span></li>`;
        srHtml += `<li><span class='sr-label'>Next Support:</span> <span class='sr-value'>${format(s1, cur.symbol)}</span></li>`;
        srHtml += `<li><span class='sr-label'>Most Bought:</span> <span class='sr-value'>${format(high, cur.symbol)}</span></li>`;
        srHtml += `<li><span class='sr-label'>Most Sold:</span> <span class='sr-value'>${format(low, cur.symbol)}</span></li>`;
        srHtml += '</ul>';
        // --- TA summary logic (majority) ---
        let srSuggestion = '-', vtSuggestion = '-', hvSuggestion = '-', taSuggestion = '-';
        // SR
        if (currentPrice <= s1 * 1.01) srSuggestion = 'BUY';
        else if (currentPrice >= r1 * 0.99) srSuggestion = 'SELL';
        else srSuggestion = 'HOLD';
        // VT
        if (Math.abs(currentPrice - high) < Math.abs(currentPrice - low)) {
            if (Math.abs(currentPrice - high) < 1) vtSuggestion = 'HOLD';
            else if (high > currentPrice) vtSuggestion = 'LOCK PROFIT';
            else vtSuggestion = 'BUY';
        } else {
            if (low > currentPrice) vtSuggestion = 'SELL';
            else vtSuggestion = 'BUY';
        }
        // HV
        let highVolumeBuy = data.volumeData?.[data.high]?.buy || 0;
        let highVolumeSell = data.volumeData?.[data.low]?.sell || 0;
        if (highVolumeBuy > highVolumeSell) hvSuggestion = 'BUY';
        else if (highVolumeSell > highVolumeBuy) hvSuggestion = 'SELL';
        else hvSuggestion = 'HOLD';
        // Combine
        const signals = [srSuggestion, vtSuggestion, hvSuggestion];
        const buyCount = signals.filter(s => s.includes('BUY')).length;
        const sellCount = signals.filter(s => s.includes('SELL')).length;
        if (buyCount >= 2) taSuggestion = 'BUY';
        else if (sellCount >= 2) taSuggestion = 'SELL';
        else taSuggestion = 'HOLD';
        // Gain/risk (NEW FORMULA for calculator tab only)
        let gain = null, risk = null;
        if (balanceBtc > 0 && levels.r1 && levels.s1) {
            if (taSuggestion === 'BUY') gain = r1 * balanceBtc;
            else if (taSuggestion === 'SELL' || taSuggestion === 'LOCK PROFIT') risk = s1 * balanceBtc;
            else if (taSuggestion === 'HOLD' || taSuggestion === 'CAUTION') {
                gain = r1 * balanceBtc;
                risk = s1 * balanceBtc;
            }
        }
        srHtml += '<ul>';
        srHtml += `<li><span class='sr-label'>Balance BTC:</span> <span class='sr-value'>${balanceBtc.toFixed(8)}</span></li>`;
        if (gain !== null) srHtml += `<li><span class='sr-label'>Reward Value:</span> <span class='sr-value sr-gain'>${gain >= 0 ? '+' : ''}${format(Math.abs(gain), cur.symbol)}</span></li>`;
        if (risk !== null) srHtml += `<li><span class='sr-label'>Risk Value:</span> <span class='sr-value sr-risk'>-${format(Math.abs(risk), cur.symbol)}</span></li>`;
        srHtml += '</ul>';
        srTargetEl.innerHTML = srHtml;
    });
}

function setupCalculatorTab() {
    const btcInput = document.getElementById('calc-btc-main');
    const sellInput = document.getElementById('calc-sell-btc');
    const entryInput = document.getElementById('calc-entry-price');
    [btcInput, sellInput, entryInput].forEach(el => {
        if (el) el.addEventListener('input', updateCalculatorTab);
    });
}
document.addEventListener('DOMContentLoaded', function() {
    setupCalculatorTab();
    setInterval(updateCalculatorTab, 5000);
});

// Show/hide calculator tab content on tab switch
(function() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const chartContainer = document.querySelector('.chart-container');
    const chartCanvas = document.getElementById('btcChart');
    const summaryCards = document.getElementById('summary-cards-wrapper');
    const converterWrapper = document.getElementById('converter-wrapper');
    const calculatorContent = document.getElementById('calculator-content');
    let chartWasRemoved = false;
    tabButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const tf = this.getAttribute('data-timeframe');
            document.querySelectorAll('.timeframe-content').forEach(content => {
                if (content.id === tf + '-content') {
                    content.style.display = 'block';
                } else {
                    content.style.display = 'none';
                }
            });
            // Show/hide chart, summary, converter, calculator
            if (tf === 'summary') {
                if (chartCanvas && chartContainer && !chartContainer.contains(chartCanvas)) {
                    chartContainer.insertBefore(chartCanvas, chartContainer.firstChild);
                    chartCanvas.style.display = 'none';
                    chartWasRemoved = false;
                }
                if (chartCanvas) chartCanvas.style.display = 'none';
                if (summaryCards) summaryCards.style.display = 'block';
                if (converterWrapper) converterWrapper.style.display = 'none';
                if (calculatorContent) calculatorContent.style.display = 'none';
            } else if (tf === 'converter') {
                if (chartCanvas && chartContainer && !chartContainer.contains(chartCanvas)) {
                    chartContainer.insertBefore(chartCanvas, chartContainer.firstChild);
                    chartCanvas.style.display = 'none';
                    chartWasRemoved = false;
                }
                if (chartCanvas) chartCanvas.style.display = 'none';
                if (summaryCards) summaryCards.style.display = 'none';
                if (converterWrapper) converterWrapper.style.display = 'block';
                if (calculatorContent) calculatorContent.style.display = 'none';
            } else if (tf === 'calculator') {
                if (chartCanvas && chartContainer && chartContainer.contains(chartCanvas)) {
                    chartContainer.removeChild(chartCanvas);
                    chartWasRemoved = true;
                }
                if (summaryCards) summaryCards.style.display = 'none';
                if (converterWrapper) converterWrapper.style.display = 'none';
                if (calculatorContent) calculatorContent.style.display = 'flex';
            } else {
                if (chartCanvas && chartContainer && !chartContainer.contains(chartCanvas)) {
                    chartContainer.insertBefore(chartCanvas, chartContainer.firstChild);
                    chartCanvas.style.display = 'block';
                    chartWasRemoved = false;
                }
                if (chartCanvas) chartCanvas.style.display = 'block';
                if (summaryCards) summaryCards.style.display = 'none';
                if (converterWrapper) converterWrapper.style.display = 'none';
                if (calculatorContent) calculatorContent.style.display = 'none';
            }
        });
    });
    // On page load, ensure chart is hidden if calculator tab is active
    document.addEventListener('DOMContentLoaded', function() {
        const activeTab = document.querySelector('.tab-button.active');
        if (activeTab && activeTab.getAttribute('data-timeframe') === 'calculator') {
            if (chartCanvas) chartCanvas.style.display = 'none';
        }
    });
})();

// Initialize the calculator when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.calculator = new MultiTimeframeBTCCalculator();
    fetchConverterRates();
    setupConverterEvents();
    fetchCurrencyRates(); // Fetch currency rates on load
    updateAllCurrencyDisplays(); // Update displays with initial currency
    updateCurrencyButtonStates(); // Update currency button states
}); 