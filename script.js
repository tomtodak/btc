class MultiTimeframeBTCCalculator {
    constructor() {
        this.currentPrice = 0;
        this.timeframes = {
            daily: { high: 0, low: 0, close: 0, levels: {}, bidVolume: {}, bidLevels: {} },
            weekly: { high: 0, low: 0, close: 0, levels: {}, bidVolume: {}, bidLevels: {} },
            monthly: { high: 0, low: 0, close: 0, levels: {}, bidVolume: {}, bidLevels: {} }
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
            
            // Calculate bid volume by price
            const bidVolume = {};
            timeframeTrades.forEach(trade => {
                const price = parseFloat(trade.price);
                const quantity = parseFloat(trade.qty);
                // Binance: isBuyerMaker === false bermakna BID (pembeli)
                if (trade.isBuyerMaker === false) {
                    if (bidVolume[price]) {
                        bidVolume[price] += quantity;
                    } else {
                        bidVolume[price] = quantity;
                    }
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
                trades: timeframeTrades, // Simpan trades untuk chart
                bidVolume: bidVolume
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
            this.calculateBidLevels(timeframe);
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
    
    calculateBidLevels(timeframe) {
        // Kira S/R/Target/Support berdasarkan bidVolume
        const bidVolume = this.timeframes[timeframe].bidVolume || {};
        const prices = Object.keys(bidVolume).map(p => parseFloat(p));
        if (prices.length === 0) return;
        // Cari price dengan bid volume paling tinggi
        let maxBid = 0, maxBidPrice = 0;
        prices.forEach(price => {
            if (bidVolume[price] > maxBid) {
                maxBid = bidVolume[price];
                maxBidPrice = price;
            }
        });
        // Gunakan maxBidPrice sebagai "pivot" untuk bid volume
        // Sediakan dummy levels (boleh refine nanti)
        this.timeframes[timeframe].bidLevels = {
            pivot: maxBidPrice,
            r1: maxBidPrice * 1.01,
            r2: maxBidPrice * 1.02,
            r3: maxBidPrice * 1.03,
            r4: maxBidPrice * 1.04,
            s1: maxBidPrice * 0.99,
            s2: maxBidPrice * 0.98,
            s3: maxBidPrice * 0.97,
            s4: maxBidPrice * 0.96
        };
    }
    
    updateAllDisplays() {
        // Update current price
        document.getElementById('currentPrice').textContent = `$${this.currentPrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
        
        // Update all timeframes
        Object.keys(this.timeframes).forEach(timeframe => {
            this.updateTimeframeDisplay(timeframe);
        });
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
                element.textContent = `$${levels[level].toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
            }
        });

        // Update pivot card with current price instead of pivot
        const pivotElement = document.getElementById(`${timeframe}-pivot`);
        if (pivotElement) {
            pivotElement.textContent = `$${this.currentPrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
        }

        // Update High, Low, Close
        const highEl = document.getElementById(`${timeframe}-high`);
        const lowEl = document.getElementById(`${timeframe}-low`);
        const closeEl = document.getElementById(`${timeframe}-close`);
        if (highEl) highEl.textContent = data.high ? `$${data.high.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}` : '-';
        if (lowEl) lowEl.textContent = data.low ? `$${data.low.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}` : '-';
        if (closeEl) closeEl.textContent = data.close ? `$${data.close.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}` : '-';

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
            <div><strong>High (Most Bought):</strong> $${data.high.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
            <div><strong>Low (Most Sold):</strong> $${data.low.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
            <div><strong>Close (Current):</strong> $${data.close.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
            <div><strong>Pivot:</strong> $${data.levels?.pivot?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || 'Calculating...'}</div>
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
            tableHTML += `<td>$${this.timeframes.daily.levels[level]?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td>`;
            tableHTML += `<td>$${this.timeframes.weekly.levels[level]?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td>`;
            tableHTML += `<td>$${this.timeframes.monthly.levels[level]?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td>`;
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

    renderBidVolumeDisplay(timeframe) {
        const bidLevels = this.timeframes[timeframe].bidLevels || {};
        const container = document.getElementById('bid-content');
        if (!container) return;
        // Papar grid TR/SL/Current Price
        container.innerHTML = `
            <div class="levels-grid-new">
                <div class="level-row">
                    <div class="level-card resistance"><div class="level-title">TR4</div><div class="price-value">${bidLevels.r4 ? '$' + bidLevels.r4.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '-'}</div></div>
                    <div class="level-card resistance"><div class="level-title">TR3</div><div class="price-value">${bidLevels.r3 ? '$' + bidLevels.r3.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '-'}</div></div>
                    <div class="level-card resistance"><div class="level-title">TR2</div><div class="price-value">${bidLevels.r2 ? '$' + bidLevels.r2.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '-'}</div></div>
                    <div class="level-card resistance"><div class="level-title">TR1</div><div class="price-value">${bidLevels.r1 ? '$' + bidLevels.r1.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '-'}</div></div>
                </div>
                <div class="level-row pivot-row">
                    <div class="level-card pivot"><div class="level-title">Current Price</div><div class="price-value">${this.currentPrice ? '$' + this.currentPrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '-'}</div></div>
                </div>
                <div class="level-row">
                    <div class="level-card support"><div class="level-title">SL1</div><div class="price-value">${bidLevels.s1 ? '$' + bidLevels.s1.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '-'}</div></div>
                    <div class="level-card support"><div class="level-title">SL2</div><div class="price-value">${bidLevels.s2 ? '$' + bidLevels.s2.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '-'}</div></div>
                    <div class="level-card support"><div class="level-title">SL3</div><div class="price-value">${bidLevels.s3 ? '$' + bidLevels.s3.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '-'}</div></div>
                    <div class="level-card support"><div class="level-title">SL4</div><div class="price-value">${bidLevels.s4 ? '$' + bidLevels.s4.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) : '-'}</div></div>
                </div>
            </div>
            <div class="suggestion-box" id="bid-suggestion">-</div>
        `;
        // Update suggestion untuk bid volume
        this.updateBidSuggestion(timeframe);
    }

    updateBidSuggestion(timeframe) {
        // Dummy logic: HOLD jika current price hampir pivot, BUY jika bawah, SELL jika atas
        const bidLevels = this.timeframes[timeframe].bidLevels || {};
        let suggestion = 'HOLD';
        let className = 'suggestion-hold';
        if (bidLevels.pivot) {
            if (this.currentPrice < bidLevels.pivot * 0.99) {
                suggestion = 'BUY';
                className = 'suggestion-buy';
            } else if (this.currentPrice > bidLevels.pivot * 1.01) {
                suggestion = 'SELL';
                className = 'suggestion-sell';
            }
        }
        const suggestionBox = document.getElementById('bid-suggestion');
        if (suggestionBox) {
            suggestionBox.textContent = suggestion;
            suggestionBox.className = `suggestion-box ${className}`;
        }
    }

    renderSummaryDisplay() {
        const container = document.getElementById('summary-content');
        if (!container) return;
        
        // Dapatkan data dari semua timeframe
        const dailyPrice = this.timeframes.daily.levels || {};
        const dailyBid = this.timeframes.daily.bidLevels || {};
        const weeklyPrice = this.timeframes.weekly.levels || {};
        const weeklyBid = this.timeframes.weekly.bidLevels || {};
        const monthlyPrice = this.timeframes.monthly.levels || {};
        const monthlyBid = this.timeframes.monthly.bidLevels || {};
        
        // Generate suggestion berdasarkan logic yang awak minta
        const suggestion = this.generateSummarySuggestion();
        
        container.innerHTML = `
            <div class="summary-container">
                <h3>📊 Summary Analysis</h3>
                
                <div class="summary-grid">
                    <div class="summary-section">
                        <h4>🎯 Price Volume Analysis</h4>
                        <div class="summary-table">
                            <table>
                                <thead>
                                    <tr><th>Level</th><th>Daily</th><th>Weekly</th><th>Monthly</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td><strong>TR4</strong></td><td>$${dailyPrice.r4?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyPrice.r4?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyPrice.r4?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>TR3</strong></td><td>$${dailyPrice.r3?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyPrice.r3?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyPrice.r3?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>TR2</strong></td><td>$${dailyPrice.r2?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyPrice.r2?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyPrice.r2?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>TR1</strong></td><td>$${dailyPrice.r1?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyPrice.r1?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyPrice.r1?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>Current</strong></td><td colspan="3" style="text-align:center;font-weight:bold;color:#ffe066;">$${this.currentPrice?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>SL1</strong></td><td>$${dailyPrice.s1?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyPrice.s1?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyPrice.s1?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>SL2</strong></td><td>$${dailyPrice.s2?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyPrice.s2?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyPrice.s2?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>SL3</strong></td><td>$${dailyPrice.s3?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyPrice.s3?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyPrice.s3?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>SL4</strong></td><td>$${dailyPrice.s4?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyPrice.s4?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyPrice.s4?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div class="summary-section">
                        <h4>💰 Bid Volume Analysis</h4>
                        <div class="summary-table">
                            <table>
                                <thead>
                                    <tr><th>Level</th><th>Daily</th><th>Weekly</th><th>Monthly</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td><strong>TR4</strong></td><td>$${dailyBid.r4?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyBid.r4?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyBid.r4?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>TR3</strong></td><td>$${dailyBid.r3?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyBid.r3?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyBid.r3?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>TR2</strong></td><td>$${dailyBid.r2?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyBid.r2?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyBid.r2?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>TR1</strong></td><td>$${dailyBid.r1?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyBid.r1?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyBid.r1?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>Current</strong></td><td colspan="3" style="text-align:center;font-weight:bold;color:#ffe066;">$${this.currentPrice?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>SL1</strong></td><td>$${dailyBid.s1?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyBid.s1?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyBid.s1?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>SL2</strong></td><td>$${dailyBid.s2?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyBid.s2?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyBid.s2?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>SL3</strong></td><td>$${dailyBid.s3?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyBid.s3?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyBid.s3?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                    <tr><td><strong>SL4</strong></td><td>$${dailyBid.s4?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${weeklyBid.s4?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td><td>$${monthlyBid.s4?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || '-'}</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                
                <div class="summary-suggestion">
                    <h4>🎯 Recommendation</h4>
                    <div class="suggestion-box ${suggestion.className}" id="summary-suggestion">
                        ${suggestion.action} at $${suggestion.price?.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) || 'N/A'}
                    </div>
                    <div class="suggestion-details">
                        <p><strong>Reason:</strong> ${suggestion.reason}</p>
                        <p><strong>Volume Analysis:</strong> ${suggestion.volumeAnalysis}</p>
                        <p><strong>Trend:</strong> ${suggestion.trend}</p>
                    </div>
                </div>
            </div>
        `;
    }

    generateSummarySuggestion() {
        // Logic berdasarkan volume distribution dan trend
        const dailyPrice = this.timeframes.daily.levels || {};
        const dailyBid = this.timeframes.daily.bidLevels || {};
        const dailyVolume = this.timeframes.daily.volumeData || {};
        const dailyBidVolume = this.timeframes.daily.bidVolume || {};
        
        // Cari price dengan volume tertinggi
        let maxVolumePrice = 0, maxVolume = 0;
        Object.keys(dailyVolume).forEach(price => {
            if (dailyVolume[price] > maxVolume) {
                maxVolume = dailyVolume[price];
                maxVolumePrice = parseFloat(price);
            }
        });
        
        // Cari price dengan bid volume tertinggi
        let maxBidVolumePrice = 0, maxBidVolume = 0;
        Object.keys(dailyBidVolume).forEach(price => {
            if (dailyBidVolume[price] > maxBidVolume) {
                maxBidVolume = dailyBidVolume[price];
                maxBidVolumePrice = parseFloat(price);
            }
        });
        
        // Determine trend (simple logic)
        const recentPrices = Object.keys(dailyVolume).map(p => parseFloat(p)).sort((a,b) => b-a);
        const trend = recentPrices.length > 1 ? (recentPrices[0] > recentPrices[recentPrices.length-1] ? 'UPTREND' : 'DOWNTREND') : 'SIDEWAYS';
        
        // Generate suggestion berdasarkan logic yang awak minta
        let action = 'HOLD';
        let price = this.currentPrice;
        let reason = 'No clear signal';
        let volumeAnalysis = 'Insufficient volume data';
        let className = 'suggestion-hold';
        
        if (maxVolumePrice && maxBidVolumePrice) {
            const avgVolumePrice = (maxVolumePrice + maxBidVolumePrice) / 2;
            
            if (this.currentPrice >= avgVolumePrice * 0.99 && this.currentPrice <= avgVolumePrice * 1.01) {
                if (trend === 'UPTREND' && maxBidVolume > maxVolume * 0.8) {
                    action = 'HOLD';
                    reason = 'Average volume highest at current price, uptrend with high bid buy';
                    volumeAnalysis = `Volume peak at $${avgVolumePrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
                    className = 'suggestion-hold';
                } else if (trend === 'DOWNTREND' && maxVolume > maxBidVolume * 0.8) {
                    action = 'LOCK PROFIT';
                    price = avgVolumePrice;
                    reason = 'Average volume highest above current price, downtrend with high sell volume';
                    volumeAnalysis = `Sell volume peak at $${avgVolumePrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
                    className = 'suggestion-sell';
                }
            } else if (this.currentPrice < avgVolumePrice * 0.99) {
                if (trend === 'UPTREND' && maxBidVolume > maxVolume * 0.8) {
                    action = 'BUY';
                    price = avgVolumePrice;
                    reason = 'Average volume highest below current price, uptrend with high bid buy';
                    volumeAnalysis = `Buy volume peak at $${avgVolumePrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
                    className = 'suggestion-buy';
                }
            } else if (this.currentPrice > avgVolumePrice * 1.01) {
                if (trend === 'DOWNTREND' && maxVolume > maxBidVolume * 0.8) {
                    action = 'SELL';
                    price = avgVolumePrice;
                    reason = 'Volume highest above current price, downtrend with high sell volume';
                    volumeAnalysis = `Sell volume peak at $${avgVolumePrice.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
                    className = 'suggestion-sell';
                }
            }
        }
        
        return {
            action,
            price,
            reason,
            volumeAnalysis,
            trend,
            className
        };
    }
}

// Tab switching functionality
document.addEventListener('DOMContentLoaded', function() {
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const timeframe = this.getAttribute('data-timeframe');
            
            // Remove active class from all buttons and content
            tabButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.timeframe-content').forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            this.classList.add('active');
            document.getElementById(timeframe + '-content').classList.add('active');
            
            // Update current timeframe in calculator
            if (window.calculator) {
                window.calculator.currentTimeframe = timeframe;
                // Render bid volume display jika tab bid
                if (timeframe === 'bid') {
                    window.calculator.renderBidVolumeDisplay('daily'); // default: daily
                }
                // Render summary display jika tab summary
                if (timeframe === 'summary') {
                    window.calculator.renderSummaryDisplay();
                }
            }
            
            // Update chart with new timeframe
            updateChartWithTimeframe(timeframe);
        });
    });
});

function updateChartWithTimeframe(timeframe) {
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

// Initialize the calculator when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.calculator = new MultiTimeframeBTCCalculator();
}); 