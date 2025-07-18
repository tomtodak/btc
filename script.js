class MultiTimeframeBTCCalculator {
    constructor() {
        this.currentPrice = 0;
        this.timeframes = {
            daily: { high: 0, low: 0, close: 0, levels: {} },
            weekly: { high: 0, low: 0, close: 0, levels: {} },
            monthly: { high: 0, low: 0, close: 0, levels: {} },
            yearly: { high: 0, low: 0, close: 0, levels: {} }
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
            // Use Binance API as primary source (more reliable, no CORS issues)
                const binanceResponse = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
                const binanceData = await binanceResponse.json();
                this.currentPrice = parseFloat(binanceData.price);
            this.updateStatus('Current price loaded successfully', 'success');
        } catch (error) {
            // Fallback to CoinGecko if Binance fails
            try {
                const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
                const data = await response.json();
                this.currentPrice = parseFloat(data.bitcoin.usd);
                this.updateStatus('Current price loaded from CoinGecko (fallback)', 'success');
            } catch (fallbackError) {
                this.updateStatus('Error loading current price', 'error');
            }
        }
    }
    
    async getAllTimeframeData() {
        await Promise.all([
            this.getTimeframeData('daily', 1),
            this.getTimeframeData('weekly', 7),
            this.getTimeframeData('monthly', 30),
            this.getTimeframeData('yearly', 365)
        ]);
    }
    
    async getTimeframeData(timeframe, days) {
        try {
            const now = new Date();
            let startDate, endDate;
            
            if (timeframe === 'daily') {
                // Semalam sahaja
                endDate = new Date(now);
                endDate.setDate(endDate.getDate() - 1); // semalam
                startDate = new Date(endDate); // hanya 1 hari
            } else if (timeframe === 'weekly') {
                // 7 hari terkini (tidak termasuk hari ini)
                endDate = new Date(now);
                endDate.setDate(endDate.getDate() - 1); // semalam
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 6); // 7 hari terkini
            } else if (timeframe === 'monthly') {
                // 30 hari terkini (tidak termasuk hari ini)
                endDate = new Date(now);
                endDate.setDate(endDate.getDate() - 1); // semalam
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 29); // 30 hari terkini
            } else if (timeframe === 'yearly') {
                // 365 hari terkini (tidak termasuk hari ini)
                endDate = new Date(now);
                endDate.setDate(endDate.getDate() - 1); // semalam
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 364); // 365 hari terkini
            }
            
            // Get current price (close semasa) - use CoinGecko for consistency
            let currentClose;
            try {
                const currentPriceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
                const currentPriceData = await currentPriceResponse.json();
                currentClose = parseFloat(currentPriceData.bitcoin.usd);
            } catch (error) {
                // Fallback to Binance if CoinGecko fails
                const currentPriceResponse = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
                const currentPriceData = await currentPriceResponse.json();
                currentClose = parseFloat(currentPriceData.price);
            }
            
            // Get historical klines untuk data dalam tempoh tersebut
            // For yearly, use klines interval 1M and limit 36 (3 years)
            const klineInterval = (timeframe === 'yearly') ? '1M' : '1h';
            const klineLimit = (timeframe === 'yearly') ? 36 : 1000;
            const klinesResponse = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${klineInterval}&startTime=${startDate.getTime()}&endTime=${endDate.getTime()}&limit=${klineLimit}`);
            const klinesData = await klinesResponse.json();
            
            // Get CoinGecko volume data untuk tempoh yang betul
            // Get CoinGecko volume data untuk tempoh yang betul
            // Fix 1: Improve CoinGecko API call dengan better error handling
            let coinGeckoData = null;
            let timeframeData = [];
            try {
                const daysToFetch = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                // Limit days untuk avoid API issues
                const safeDays = Math.min(daysToFetch, 365);
                const coinGeckoResponse = await fetch(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${safeDays}&interval=daily`);
                coinGeckoData = await coinGeckoResponse.json();
                
                // Fix 2: Better data filtering
                if (coinGeckoData && coinGeckoData.prices) {
                    timeframeData = coinGeckoData.prices.filter((priceData, index) => {
                        const timestamp = priceData[0];
                        const date = new Date(timestamp);
                        return date >= startDate && date <= endDate;
                    });
                    
                    // If no filtered data, use all available data
                    if (timeframeData.length === 0 && coinGeckoData.prices.length > 0) {
                        timeframeData = coinGeckoData.prices;
                        console.log(`Using all available CoinGecko data for ${timeframe}`);
                    }
                }
            } catch (error) {
                console.log(`CoinGecko API failed for ${timeframe}:`, error);
                coinGeckoData = null;
            }
            
            // Calculate volume by price using CoinGecko data
            const priceVolume = {};
            if (timeframeData.length > 0) {
                timeframeData.forEach((priceData, index) => {
                    const price = priceData[1];
                    const volume = coinGeckoData && coinGeckoData.total_volumes && coinGeckoData.total_volumes[index] ? coinGeckoData.total_volumes[index][1] : 0;
                    
                    // Round price to nearest dollar for grouping
                    const roundedPrice = Math.round(price);
                    
                    if (priceVolume[roundedPrice]) {
                        priceVolume[roundedPrice] += volume;
                    } else {
                        priceVolume[roundedPrice] = volume;
                    }
                });
            }
            
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
            
            // Special fix for daily: if only 1 data point from CoinGecko, use klines high/low
            if (timeframe === 'daily' && timeframeData.length <= 1 && klinesData && klinesData.length > 0) {
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
            
            // Fix 3: Improve fallback logic
            if (maxVolumePrice === 0 || minVolumePrice === 0) {
                console.log(`Using klines data for ${timeframe} - volume data insufficient`);
                
                let highPrice = 0;
                let lowPrice = Infinity;
                
                if (klinesData && klinesData.length > 0) {
                    klinesData.forEach(kline => {
                        const high = parseFloat(kline[2]);
                        const low = parseFloat(kline[3]);
                        
                        if (high > highPrice) highPrice = high;
                        if (low < lowPrice) lowPrice = low;
                    });
                    
                    maxVolumePrice = highPrice;
                    minVolumePrice = lowPrice;
                } else {
                    // If klines also fail, use current price fallback
                    console.log(`Using current price fallback for ${timeframe} - no klines data`);
                    maxVolumePrice = currentClose * 1.05;
                    minVolumePrice = currentClose * 0.95;
                }
            }
            
            // Final fallback: Gunakan current price ± 5% jika masih zero
            if (maxVolumePrice === 0 || minVolumePrice === 0) {
                console.log(`Using current price fallback for ${timeframe}`);
                maxVolumePrice = currentClose * 1.05;
                minVolumePrice = currentClose * 0.95;
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
                coinGeckoData: timeframeData // Simpan CoinGecko data untuk chart
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
        
        // Fix 2: Ensure proper order (high > low)
        const adjustedHigh = Math.max(high, low);
        const adjustedLow = Math.min(high, low);
        
        // Pivot calculation
        const pivot = (adjustedHigh + adjustedLow + close) / 3;
        
        // R1 and S1
        const r1 = (2 * pivot) - adjustedLow;
        const s1 = (2 * pivot) - adjustedHigh;
        
        // R2 and S2 (correct formula)
        const r2 = pivot + (adjustedHigh - adjustedLow);
        const s2 = pivot - (adjustedHigh - adjustedLow);
        
        // R3, R4, S3, S4 (using range from R1-S1)
        const range = Math.abs(r1 - s1);
        
        // Calculate all levels
        this.timeframes[timeframe].levels = {
            r4: pivot + (range * 3),
            r3: pivot + (range * 2),
            r2: r2,
            r1: r1,
            pivot: pivot,
            s1: s1,
            s2: s2,
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
        
        // Update prediction display
        this.updatePredictionDisplay();
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
        if (!window.btcChart) {
            console.log('Chart not available');
            return;
        }
        
        const data = this.timeframes[timeframe];
        if (!data || !data.coinGeckoData) {
            console.log('No data available for chart update');
            return;
        }
        
        try {
        // Generate candlestick data from CoinGecko data
            const candlestickData = window.btcChart.generateCandlestickData(data.coinGeckoData, timeframe);
        
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
            if (typeof window.btcChart.setData === 'function') {
                window.btcChart.setData(candlestickData, supportLevels, resistanceLevels, this.currentPrice, timeframe);
            } else {
                console.log('Chart setData method not available');
            }
        } catch (error) {
            console.log('Chart update error:', error);
        }
    }
    
    updateComparisonTable() {
        const tableBody = document.getElementById('comparisonTable');
        const levels = ['r4', 'r3', 'r2', 'r1', 'pivot', 's1', 's2', 's3', 's4'];
        
        let tableHTML = '';
        levels.forEach(level => {
            tableHTML += '<tr>';
            tableHTML += `<td><strong>${level.toUpperCase()}</strong></td>`;
            tableHTML += `<td>${formatSRLevel(this.timeframes.daily.levels[level])}</td>`;
            tableHTML += `<td>${formatSRLevel(this.timeframes.weekly.levels[level])}</td>`;
            tableHTML += `<td>${formatSRLevel(this.timeframes.monthly.levels[level])}</td>`;
            tableHTML += `<td>${formatSRLevel(this.timeframes.yearly.levels[level])}</td>`;
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
            yearly: {
                pivot: this.timeframes.yearly.levels?.pivot || 0,
                r1: this.timeframes.yearly.levels?.r1 || 0,
                s1: this.timeframes.yearly.levels?.s1 || 0
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
        const timeframes = ['daily', 'weekly', 'monthly', 'yearly'];
        timeframes.forEach(tf => {
            const data = this.timeframes[tf];
            const levels = data.levels;
            let srSuggestion = '-', vtSuggestion = '-', hvSuggestion = '-', taSuggestion = '-';
            let taTarget = '';
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

                // === UPDATED: Weighted average with 3 signals only ===
                // Weighted TA logic (SR: 45%, HV: 35%, VT: 20%)
                const weights = { SR: 0.45, HV: 0.35, VT: 0.20 };
                let totalScore = 0;
                let totalWeight = 0;
                
                // Calculate weighted score for each signal
                const signals = [
                    { type: 'SR', suggestion: srSuggestion, weight: weights.SR },
                    { type: 'HV', suggestion: hvSuggestion, weight: weights.HV },
                    { type: 'VT', suggestion: vtSuggestion, weight: weights.VT }
                ];
                
                signals.forEach(signal => {
                    let score = 0;
                    if (signal.suggestion === 'BUY') score = 1;
                    else if (signal.suggestion === 'SELL' || signal.suggestion === 'LOCK PROFIT') score = -1;
                    else score = 0;
                    
                    totalScore += score * signal.weight;
                    totalWeight += signal.weight;
                });
                
                // Determine final TA suggestion
                if (totalWeight > 0) {
                    const averageScore = totalScore / totalWeight;
                    if (averageScore >= 0.3) {
                        taSuggestion = 'BUY';
                    } else if (averageScore <= -0.3) {
                        taSuggestion = 'SELL';
                    } else {
                        taSuggestion = 'HOLD';
                    }
                } else {
                    taSuggestion = 'HOLD';
                }

            // Next target/support untuk TA (guna formatPrice)
            // Logic dinamik: cari resistance/support terdekat dari current price
            const resistanceLevels = ['r1', 'r2', 'r3', 'r4'];
            const supportLevels = ['s1', 's2', 's3', 's4'];
            let nextTargetLevel = null, nextSupportLevel = null;
            for (let i = 0; i < resistanceLevels.length; i++) {
                const lvl = levels[resistanceLevels[i]];
                if (lvl > current) {
                    nextTargetLevel = lvl;
                    break;
                }
            }
            for (let i = 0; i < supportLevels.length; i++) {
                const lvl = levels[supportLevels[i]];
                if (lvl < current) {
                    nextSupportLevel = lvl;
                    break;
                }
            }
                // Jika tiada support di bawah, cari support seterusnya (S2, S3, S4)
                if (nextSupportLevel === null) {
                    for (let i = 0; i < supportLevels.length; i++) {
                        const lvl = levels[supportLevels[i]];
                        if (lvl > 0) {
                            nextSupportLevel = lvl;
                            break;
                        }
                    }
                }
            if (taSuggestion === 'HOLD' || taSuggestion === 'CAUTION') {
                taTarget = `
                    <div class='next-target' style='margin-bottom:0;'>Next Target: <b>${window.formatPrice ? window.formatPrice(nextTargetLevel) : (nextTargetLevel ?? '-')}</b></div>
                    <div class='next-target last-next-target'>Next Support: <b>${window.formatPrice ? window.formatPrice(nextSupportLevel) : (nextSupportLevel ?? '-')}</b></div>
                `;
            } else if (taSuggestion.includes('BUY')) {
                taTarget = `<div class='next-target last-next-target'>Next Target: <b>${window.formatPrice ? window.formatPrice(nextTargetLevel) : (nextTargetLevel ?? '-')}</b></div>`;
            } else if (taSuggestion.includes('SELL') || taSuggestion === 'LOCK PROFIT') {
                taTarget = `<div class='next-target last-next-target'>Next Support: <b>${window.formatPrice ? window.formatPrice(nextSupportLevel) : (nextSupportLevel ?? '-')}</b></div>`;
            }

            // Determine which has more volume
            const buyVol = data.volumeData?.[data.high]?.buy || 0;
            const sellVol = data.volumeData?.[data.low]?.sell || 0;
            const highlightBought = buyVol >= sellVol;
            const highlightSold = sellVol > buyVol;
            const mostBoughtStyle = highlightBought ? 'color:#16c784;font-weight:bold;' : '';
            const mostSoldStyle = highlightSold ? 'color:#ff4b4b;font-weight:bold;' : '';
            // Add color styling for SR, VT, HV suggestions
            const getSuggestionColor = (suggestion) => {
                if (suggestion === 'BUY') return 'color:#16c784;font-weight:bold;';
                if (suggestion === 'SELL' || suggestion === 'LOCK PROFIT') return 'color:#ff4b4b;font-weight:bold;';
                return 'color:#ffffff;font-weight:bold;';
            };
            
            const srColor = getSuggestionColor(srSuggestion);
            const vtColor = getSuggestionColor(vtSuggestion);
            const hvColor = getSuggestionColor(hvSuggestion);
            
            info = `
                ${taTarget}
                <div><b>SR</b>: <span style="${srColor}">${srSuggestion}</span></div>
                <div><b>VT</b>: <span style="${vtColor}">${vtSuggestion}</span></div>
                <div><b>HV</b>: <span style="${hvColor}">${hvSuggestion}</span></div>
                <div style="margin-top:8px;">Current Price: <b>${window.formatPrice ? window.formatPrice(current) : current}</b></div>
                <div style='${mostBoughtStyle}'>Most Bought: <b>${window.formatPrice ? window.formatPrice(data.high) : data.high}</b></div>
                <div style='${mostSoldStyle}'>Most Sold: <b>${window.formatPrice ? window.formatPrice(data.low) : data.low}</b></div>
            `;
            }
            
            // === ADDED BACK: Display individual timeframe suggestions ===
            // Papar TA dengan color coding
            const taElement = document.getElementById(`summary-${tf}-suggestion`);
            if (taElement) {
                taElement.textContent = taSuggestion;
                
                // Add color coding based on TA suggestion
                if (taSuggestion === 'BUY') {
                    taElement.style.color = '#16c784'; // Green
                    taElement.style.fontWeight = 'bold';
                } else if (taSuggestion === 'SELL' || taSuggestion === 'LOCK PROFIT') {
                    taElement.style.color = '#ff4b4b'; // Red
                    taElement.style.fontWeight = 'bold';
                } else {
                    taElement.style.color = '#ffffff'; // White (default)
                    taElement.style.fontWeight = 'normal';
                }
            }
            
            // Papar next target/support TA di bawah, kemudian SR & VT & HV, kemudian info harga
            const infoElement = document.getElementById(`summary-${tf}-info`);
            if (infoElement) {
                infoElement.innerHTML = info;
            }
        });
        
        // Add Main Suggestion Analysis
        this.updateMainSuggestion();
        
        // Add Chinese Zodiac Analysis
        this.updateChineseZodiacAnalysis();
    }
    
    updateMainSuggestion() {
        const timeframes = ['daily', 'weekly', 'monthly', 'yearly'];
        // === UPDATED: New weight distribution ===
        const weights = { 
            monthly: 0.45,  // 45% - paling tinggi
            daily: 0.20,    // 20% - kedua
            yearly: 0.10,   // 10% - ketiga
            weekly: 0.05    // 5% - paling rendah
        }; // Total: 80% untuk timeframe signals
        
        let totalScore = 0;
        let totalWeight = 0;
        let trendAnalysis = { uptrend: 0, downtrend: 0, neutral: 0 }; // Track trend signals
        
        timeframes.forEach(tf => {
            const data = this.timeframes[tf];
            if (!data || !data.levels || !data.high || !data.low || !data.close) return;
            
            const levels = data.levels;
            const current = this.currentPrice;
            let srSuggestion = '-', vtSuggestion = '-', hvSuggestion = '-', trendSuggestion = '-', taSuggestion = '-';
            
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
            
            // HV suggestion
            let highVolumeBuy = data.volumeData?.[data.high]?.buy || 0;
            let highVolumeSell = data.volumeData?.[data.low]?.sell || 0;
            if (highVolumeBuy > highVolumeSell) {
                hvSuggestion = 'BUY';
            } else if (highVolumeSell > highVolumeBuy) {
                hvSuggestion = 'SELL';
            } else {
                hvSuggestion = 'HOLD';
            }
            
            // === UPDATED: Trend Analysis Logic dengan weight 20% ===
            const mostBoughtPrice = data.high;
            const mostSoldPrice = data.low;
            
            if (mostBoughtPrice > 0 && mostSoldPrice > 0) {
                const currentToBoughtPercent = ((current - mostBoughtPrice) / mostBoughtPrice) * 100;
                const currentToSoldPercent = ((current - mostSoldPrice) / mostSoldPrice) * 100;
                
                // Logic: If current price is within 5% above Most Bought → UPTREND
                if (currentToBoughtPercent >= -5 && currentToBoughtPercent <= 5) {
                    trendSuggestion = 'BUY'; // Uptrend signal
                    trendAnalysis.uptrend += 0.20; // 20% weight untuk trend
                }
                // Logic: If current price is below 5% from Most Sold → DOWNTREND
                else if (currentToSoldPercent <= -5) {
                    trendSuggestion = 'SELL'; // Downtrend signal
                    trendAnalysis.downtrend += 0.20; // 20% weight untuk trend
                }
                // Logic: If not uptrend or downtrend → NEUTRAL
                else {
                    trendSuggestion = 'HOLD'; // Neutral signal
                    trendAnalysis.neutral += 0.20; // 20% weight untuk trend
                }
            } else {
                trendSuggestion = 'HOLD';
                trendAnalysis.neutral += 0.20; // 20% weight untuk trend
            }
            
            // Combine TA logic (majority) - now includes trend analysis
            const signals = [srSuggestion, vtSuggestion, hvSuggestion, trendSuggestion];
            const buyCount = signals.filter(s => s.includes('BUY')).length;
            const sellCount = signals.filter(s => s.includes('SELL')).length;
            if (buyCount >= 2) taSuggestion = 'BUY';
            else if (sellCount >= 2) taSuggestion = 'SELL';
            else taSuggestion = 'HOLD';
            
            // Calculate weighted score untuk timeframe signals (80% total)
            let score = 0;
            if (taSuggestion === 'BUY') score = 1;
            else if (taSuggestion === 'SELL' || taSuggestion === 'LOCK PROFIT') score = -1;
            else score = 0;
            
            totalScore += score * weights[tf]; // 80% dari timeframe signals
            totalWeight += weights[tf]; // 80% total weight
        });
        
        // === UPDATED: Calculate main suggestion dengan 80% timeframe + 20% trend ===
        let mainSuggestion = 'HOLD';
        if (totalWeight > 0) {
            const averageScore = totalScore / totalWeight; // 80% timeframe signals
            if (averageScore >= 0.3) {
                mainSuggestion = 'BUY';
            } else if (averageScore <= -0.3) {
                mainSuggestion = 'SELL';
            }
        }
        
        // === UPDATED: Determine dominant trend (20% weight) ===
        let dominantTrend = 'NEUTRAL';
        let trendColor = '#ffffff'; // White for neutral
        
        // Find the highest weighted trend (20% weight)
        if (trendAnalysis.uptrend > trendAnalysis.downtrend && trendAnalysis.uptrend > trendAnalysis.neutral) {
            dominantTrend = 'UPTREND';
            trendColor = '#16c784'; // Green for uptrend
        } else if (trendAnalysis.downtrend > trendAnalysis.uptrend && trendAnalysis.downtrend > trendAnalysis.neutral) {
            dominantTrend = 'DOWNTREND';
            trendColor = '#ff4b4b'; // Red for downtrend
        } else {
            dominantTrend = 'NEUTRAL';
            trendColor = '#ffffff'; // White for neutral
        }
        
        // Update main suggestion display with trend information
        const mainElement = document.getElementById('summary-main-suggestion');
        if (mainElement) {
            // Display both main suggestion and trend
            mainElement.innerHTML = `
                <div style="font-size: 1.2em; font-weight: bold; margin-bottom: 5px;">${mainSuggestion}</div>
                <div style="font-size: 0.6em; color: ${trendColor}; font-weight: bold;">${dominantTrend}</div>
            `;
            
            // Color coding for main suggestion
            if (mainSuggestion === 'BUY') {
                mainElement.style.color = '#16c784'; // Green
            } else if (mainSuggestion === 'SELL') {
                mainElement.style.color = '#ff4b4b'; // Red
            } else {
                mainElement.style.color = '#ffffff'; // White
            }
        }
    }
    
    updateChineseZodiacAnalysis() {
        const currentYear = new Date().getFullYear();
        
        // Chinese Zodiac cycle: Rat, Ox, Tiger, Rabbit, Dragon, Snake, Horse, Goat, Monkey, Rooster, Dog, Pig
        // Rat allies: Ox, Dragon, Monkey
        
        // Function to determine Chinese zodiac animal for a given year
        const getChineseZodiac = (year) => {
            const zodiacAnimals = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
            const startYear = 1900; // Rat year
            const index = (year - startYear) % 12;
            return zodiacAnimals[index];
        };
        
        const currentZodiac = getChineseZodiac(currentYear);
        let zodiacSuggestion = '-';
        let zodiacInfo = '';
        
        if (currentZodiac === 'Rat') {
            zodiacSuggestion = 'THE BEST YEAR';
            zodiacInfo = `
                <div>Current Year: <b>${currentZodiac} Year</b></div>
                <div style="margin-top:8px;">A rare window of opportunity — the kind of year where smart moves can lead to significant gains.</div>
            `;
        } else if (currentZodiac === 'Ox' || currentZodiac === 'Dragon' || currentZodiac === 'Monkey') {
            zodiacSuggestion = 'GOOD YEAR';
            zodiacInfo = `
                <div>Current Year: <b>${currentZodiac} Year</b></div>
                <div style="margin-top:8px;">A good year to grow your portfolio with confidence.</div>
            `;
        } else {
            zodiacSuggestion = 'NEUTRAL YEAR';
            zodiacInfo = `
                <div>Current Year: <b>${currentZodiac} Year</b></div>
                <div style="margin-top:8px;">A steady outlook — stay informed and adjust as needed.</div>
            `;
        }
        
        // Update zodiac suggestion with color coding
        const zodiacElement = document.getElementById('summary-zodiac-suggestion');
        zodiacElement.textContent = zodiacSuggestion;
        
        if (zodiacSuggestion === 'THE BEST YEAR') {
            zodiacElement.style.color = '#16c784'; // Green
            zodiacElement.style.fontWeight = 'bold';
        } else if (zodiacSuggestion === 'GOOD YEAR') {
            zodiacElement.style.color = '#16c784'; // Green (same as best year)
            zodiacElement.style.fontWeight = 'bold';
        } else {
            zodiacElement.style.color = '#ffffff'; // White
            zodiacElement.style.fontWeight = 'normal';
        }
        
        // Update zodiac info
        document.getElementById('summary-zodiac-info').innerHTML = zodiacInfo;
    }

    // Tambah fungsi prediksi 3 bulan
    predictNext3Months() {
        const timeframes = ['daily', 'weekly', 'monthly', 'yearly'];
        const current = this.currentPrice;
        
        // 1. Analisis trend dari semua timeframe
        let bullishSignals = 0;
        let bearishSignals = 0;
        let totalSignals = 0;
        
        timeframes.forEach(tf => {
            const data = this.timeframes[tf];
            if (!data || !data.levels) return;
            
            const levels = data.levels;
            
            // Check position relative to pivot
            if (current > levels.pivot) {
                bullishSignals++;
            } else if (current < levels.pivot) {
                bearishSignals++;
            }
            totalSignals++;
            
            // Check momentum (distance from support/resistance)
            const distanceToR1 = Math.abs(current - levels.r1);
            const distanceToS1 = Math.abs(current - levels.s1);
            
            if (distanceToR1 < distanceToS1) {
                bullishSignals += 0.5;
            } else {
                bearishSignals += 0.5;
            }
        });
        
        // 2. Calculate trend strength
        const trendStrength = (bullishSignals - bearishSignals) / totalSignals;
        
        // 3. Predict price ranges for next 3 months
        const monthlyData = this.timeframes.monthly;
        let predictedHigh = current;
        let predictedLow = current;
        let confidence = 'MEDIUM';
        let highlightedTarget = 'NONE';
        
        if (monthlyData && monthlyData.levels) {
            const monthlyLevels = monthlyData.levels;
            
            // Calculate current position relative to levels
            const currentToR1 = ((current - monthlyLevels.r1) / monthlyLevels.r1) * 100;
            const currentToS1 = ((current - monthlyLevels.s1) / monthlyLevels.s1) * 100;
            const currentToPivot = ((current - monthlyLevels.pivot) / monthlyLevels.pivot) * 100;
            
            if (trendStrength > 0.3) {
                // Bullish prediction - Kekalkan R2 (lebih realistic)
                predictedHigh = monthlyLevels.r2 || current * 1.15;  // ← Kekalkan R2
                predictedLow = monthlyLevels.s1 || current * 0.95;
                confidence = 'HIGH';
                highlightedTarget = 'HIGH';
            } else if (trendStrength < -0.3) {
                // Bearish prediction
                predictedHigh = monthlyLevels.r1 || current * 1.05;
                predictedLow = monthlyLevels.s2 || current * 0.85;
                confidence = 'HIGH';
                highlightedTarget = 'LOW';
            } else {
                // Neutral prediction
                predictedHigh = monthlyLevels.r1 || current * 1.10;
                predictedLow = monthlyLevels.s1 || current * 0.90;
                confidence = 'MEDIUM';
                
                // For neutral, determine highlight based on position
                if (Math.abs(currentToPivot) < 2) {
                    highlightedTarget = 'NONE';
                } else if (currentToR1 > -5 && currentToR1 < 5) {
                    highlightedTarget = 'LOW';
                } else if (currentToS1 > -5 && currentToS1 < 5) {
                    highlightedTarget = 'HIGH';
                } else {
                    highlightedTarget = 'NONE';
                }
            }
        }
        
        // 4. Calculate probability ranges
        const prediction = {
            currentPrice: current,
            predictedHigh: predictedHigh,
            predictedLow: predictedLow,
            trendStrength: trendStrength,
            confidence: confidence,
            highlightedTarget: highlightedTarget,
            timeframe: '3 Months',
            bullishSignals: bullishSignals,
            bearishSignals: bearishSignals,
            totalSignals: totalSignals,
            analysis: this.generatePredictionAnalysis(trendStrength, predictedHigh, predictedLow)
        };
        
        return prediction;
    }

    generatePredictionAnalysis(trendStrength, predictedHigh, predictedLow) {
        let analysis = '';
        
        if (trendStrength > 0.5) {
            analysis = `Strong bullish momentum detected. Price likely to test resistance levels with potential breakout above ${window.formatPrice ? window.formatPrice(predictedHigh) : `$${predictedHigh.toLocaleString()}`}.`;
        } else if (trendStrength > 0.2) {
            analysis = `Moderate bullish bias. Expect gradual upward movement with resistance at ${window.formatPrice ? window.formatPrice(predictedHigh) : `$${predictedHigh.toLocaleString()}`}.`;
        } else if (trendStrength < -0.5) {
            analysis = `Strong bearish pressure. Price may test support levels with potential breakdown below ${window.formatPrice ? window.formatPrice(predictedLow) : `$${predictedLow.toLocaleString()}`}.`;
        } else if (trendStrength < -0.2) {
            analysis = `Moderate bearish bias. Expect downward movement with support at ${window.formatPrice ? window.formatPrice(predictedLow) : `$${predictedLow.toLocaleString()}`}.`;
        } else {
            analysis = `Neutral market conditions. Price likely to consolidate between ${window.formatPrice ? window.formatPrice(predictedLow) : `$${predictedLow.toLocaleString()}`} and ${window.formatPrice ? window.formatPrice(predictedHigh) : `$${predictedHigh.toLocaleString()}`}.`;
        }
        
        return analysis;
    }

    // Tambah fungsi untuk display prediksi
    updatePredictionDisplay() {
        const shortTermPrediction = this.predictNext3Months();
        const longTermPrediction = this.predictNext4Years();
        
        // Only update prediction display if we're in the prediction tab
        const predictionContent = document.getElementById('prediction-content');
        if (!predictionContent || predictionContent.style.display === 'none') {
            return;
        }
        
        const predictionContainer = document.getElementById('prediction-container');
        if (!predictionContainer) return;
        
        // Short-term styling
        const shortTermConfidenceColor = shortTermPrediction.confidence === 'HIGH' ? '#16c784' : 
                                       shortTermPrediction.confidence === 'MEDIUM' ? '#ffa500' : '#ff4b4b';
        
        const shortTermTrendColor = shortTermPrediction.trendStrength > 0.2 ? '#16c784' : 
                                   shortTermPrediction.trendStrength < -0.2 ? '#ff4b4b' : '#ffffff';
        
        const shortTermHighStyle = shortTermPrediction.highlightedTarget === 'HIGH' ? 
            'background: rgba(22, 199, 132, 0.2); border: 2px solid #16c784; box-shadow: 0 0 15px rgba(22, 199, 132, 0.3);' : 
            'background: rgba(255,255,255,0.1);';
        
        const shortTermLowStyle = shortTermPrediction.highlightedTarget === 'LOW' ? 
            'background: rgba(255, 75, 75, 0.2); border: 2px solid #ff4b4b; box-shadow: 0 0 15px rgba(255, 75, 75, 0.3);' : 
            'background: rgba(255,255,255,0.1);';
        
        // Long-term styling
        const longTermConfidenceColor = longTermPrediction.confidence === 'HIGH' ? '#16c784' : 
                                       longTermPrediction.confidence === 'MEDIUM' ? '#ffa500' : '#ff4b4b';
        
        const longTermTrendColor = longTermPrediction.trendStrength > 0.2 ? '#16c784' : 
                                  longTermPrediction.trendStrength < -0.2 ? '#ff4b4b' : '#ffffff';
        
        const longTermHighStyle = longTermPrediction.highlightedTarget === 'HIGH' ? 
            'background: rgba(22, 199, 132, 0.3); border: 3px solid #16c784; box-shadow: 0 0 20px rgba(22, 199, 132, 0.4);' : 
            'background: rgba(255,255,255,0.1);';
        
        const longTermLowStyle = longTermPrediction.highlightedTarget === 'LOW' ? 
            'background: rgba(255, 75, 75, 0.3); border: 3px solid #ff4b4b; box-shadow: 0 0 20px rgba(255, 75, 75, 0.4);' : 
            'background: rgba(255,255,255,0.1);';
        
        // Trajectory indicators
        const shortTermIcon = shortTermPrediction.highlightedTarget === 'HIGH' ? '🚀' : 
                             shortTermPrediction.highlightedTarget === 'LOW' ? '📉' : '➡️';
        
        const shortTermText = shortTermPrediction.highlightedTarget === 'HIGH' ? 'EXPECTING UPTREND' :
                             shortTermPrediction.highlightedTarget === 'LOW' ? 'EXPECTING DOWNTREND' : 
                              'EXPECTING SIDEWAYS';
        
        const longTermIcon = longTermPrediction.highlightedTarget === 'HIGH' ? '🚀' : 
                            longTermPrediction.highlightedTarget === 'LOW' ? '📉' : '➡️';
        
        const longTermText = longTermPrediction.highlightedTarget === 'HIGH' ? 'LONG-TERM BULLISH' :
                            longTermPrediction.highlightedTarget === 'LOW' ? 'LONG-TERM BEARISH' : 
                            'LONG-TERM NEUTRAL';
        
        predictionContainer.innerHTML = `
            <div class="prediction-header" style="text-align: center; margin-bottom: 30px;">
                <h3 style="color: #fff; margin-bottom: 10px;">🎯 BTC Price Predictions</h3>
                <div style="color: #ccc; font-size: 14px;">Short-term (3 Months) & Long-term Analysis</div>
            </div>
            
            <!-- Short-term Prediction Section -->
            <div class="prediction-section" style="margin-bottom: 40px;">
                <div class="section-header" style="text-align: center; margin-bottom: 20px;">
                    <h4 style="color: #fff; font-size: 18px; margin-bottom: 5px;"> 3-Month Prediction</h4>
                    <div style="color: ${shortTermConfidenceColor}; font-weight: bold; font-size: 16px;">
                        Confidence: ${shortTermPrediction.confidence}
                    </div>
                    <div style="margin-top: 5px; font-size: 14px; color: #ccc;">
                        ${shortTermIcon} ${shortTermText}
                </div>
            </div>
            
                <div class="prediction-details" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                    <div class="prediction-item" style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 12px; color: #ccc; margin-bottom: 5px;">Current Price</div>
                        <div style="font-size: 18px; font-weight: bold; color: #fff;">${window.formatPrice ? window.formatPrice(shortTermPrediction.currentPrice) : `$${shortTermPrediction.currentPrice.toLocaleString()}`}</div>
                </div>
                
                    <div class="prediction-item" style="${shortTermHighStyle} padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 12px; color: #ccc; margin-bottom: 5px;">
                            ${shortTermPrediction.highlightedTarget === 'HIGH' ? '🎯 TARGET' : 'Predicted High'}
                    </div>
                        <div style="font-size: 18px; font-weight: bold; color: #16c784">${window.formatPrice ? window.formatPrice(shortTermPrediction.predictedHigh) : `$${shortTermPrediction.predictedHigh.toLocaleString()}`}</div>
                </div>
                
                    <div class="prediction-item" style="${shortTermLowStyle} padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 12px; color: #ccc; margin-bottom: 5px;">
                            ${shortTermPrediction.highlightedTarget === 'LOW' ? '🎯 TARGET' : 'Predicted Low'}
                    </div>
                        <div style="font-size: 18px; font-weight: bold; color: #ff4b4b">${window.formatPrice ? window.formatPrice(shortTermPrediction.predictedLow) : `$${shortTermPrediction.predictedLow.toLocaleString()}`}</div>
                </div>
                
                    <div class="prediction-item" style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 12px; color: #ccc; margin-bottom: 5px;">Trend Strength</div>
                        <div style="font-size: 18px; font-weight: bold; color: ${shortTermTrendColor}">${(shortTermPrediction.trendStrength * 100).toFixed(1)}%</div>
                </div>
            </div>
            
                <div class="prediction-analysis" style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <h5 style="color: #fff; margin-bottom: 10px; font-size: 14px;">📊 Short-term Analysis</h5>
                    <p style="color: #ccc; line-height: 1.4; font-size: 13px;">${shortTermPrediction.analysis}</p>
            </div>
            
                <div class="prediction-signals" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                    <div class="signal-item" style="background: rgba(22, 199, 132, 0.1); padding: 15px; border-radius: 8px; text-align: center; border: 1px solid rgba(22, 199, 132, 0.3);">
                        <div style="font-size: 11px; color: #ccc; margin-bottom: 5px;">Bullish Signals</div>
                        <div style="font-size: 16px; font-weight: bold; color: #16c784">${shortTermPrediction.bullishSignals}</div>
                </div>
                    <div class="signal-item" style="background: rgba(255, 75, 75, 0.1); padding: 15px; border-radius: 8px; text-align: center; border: 1px solid rgba(255, 75, 75, 0.3);">
                        <div style="font-size: 11px; color: #ccc; margin-bottom: 5px;">Bearish Signals</div>
                        <div style="font-size: 16px; font-weight: bold; color: #ff4b4b">${shortTermPrediction.bearishSignals}</div>
                </div>
            </div>
            </div>
            
            <!-- Long-term Prediction Section -->
            <div class="prediction-section" style="margin-bottom: 40px;">
                <div class="section-header" style="text-align: center; margin-bottom: 20px;">
                    <h4 style="color: #fff; font-size: 18px; margin-bottom: 5px;">🚀 Long-term Prediction</h4>
                    <div style="color: ${longTermConfidenceColor}; font-weight: bold; font-size: 16px;">
                        Confidence: ${longTermPrediction.confidence}
                    </div>
                    <div style="margin-top: 5px; font-size: 14px; color: #ccc;">
                        ${longTermIcon} ${longTermText}
                    </div>
                </div>
                
                <div class="prediction-details" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                    <div class="prediction-item" style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 12px; color: #ccc; margin-bottom: 5px;">Current Price</div>
                        <div style="font-size: 18px; font-weight: bold; color: #fff;">${window.formatPrice ? window.formatPrice(longTermPrediction.currentPrice) : `$${longTermPrediction.currentPrice.toLocaleString()}`}</div>
                    </div>
                    
                    <div class="prediction-item" style="${longTermHighStyle} padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 12px; color: #ccc; margin-bottom: 5px;">
                            ${longTermPrediction.highlightedTarget === 'HIGH' ? '🎯 LONG-TERM TARGET' : 'Predicted High (4Y)'}
                        </div>
                        <div style="font-size: 18px; font-weight: bold; color: #16c784">${window.formatPrice ? window.formatPrice(longTermPrediction.predictedHigh) : `$${longTermPrediction.predictedHigh.toLocaleString()}`}</div>
                    </div>
                    
                    <div class="prediction-item" style="${longTermLowStyle} padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 12px; color: #ccc; margin-bottom: 5px;">
                            ${longTermPrediction.highlightedTarget === 'LOW' ? '🎯 LONG-TERM TARGET' : 'Predicted Low (4Y)'}
                        </div>
                        <div style="font-size: 18px; font-weight: bold; color: #ff4b4b">${window.formatPrice ? window.formatPrice(longTermPrediction.predictedLow) : `$${longTermPrediction.predictedLow.toLocaleString()}`}</div>
                    </div>
                    
                    <div class="prediction-item" style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 12px; color: #ccc; margin-bottom: 5px;">Long-term Trend</div>
                        <div style="font-size: 18px; font-weight: bold; color: ${longTermTrendColor}">${(longTermPrediction.trendStrength * 100).toFixed(1)}%</div>
                    </div>
                </div>
                
                <div class="prediction-analysis" style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <h5 style="color: #fff; margin-bottom: 10px; font-size: 14px;"> Long-term Analysis</h5>
                    <p style="color: #ccc; line-height: 1.4; font-size: 13px;">${longTermPrediction.analysis}</p>
                </div>
                
                <div class="prediction-signals" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                    <div class="signal-item" style="background: rgba(22, 199, 132, 0.1); padding: 15px; border-radius: 8px; text-align: center; border: 1px solid rgba(22, 199, 132, 0.3);">
                        <div style="font-size: 11px; color: #ccc; margin-bottom: 5px;">Bullish Signals (Weighted)</div>
                        <div style="font-size: 16px; font-weight: bold; color: #16c784">${longTermPrediction.bullishSignals.toFixed(2)}</div>
                    </div>
                    <div class="signal-item" style="background: rgba(255, 75, 75, 0.1); padding: 15px; border-radius: 8px; text-align: center; border: 1px solid rgba(255, 75, 75, 0.3);">
                        <div style="font-size: 11px; color: #ccc; margin-bottom: 5px;">Bearish Signals (Weighted)</div>
                        <div style="font-size: 16px; font-weight: bold; color: #ff4b4b">${longTermPrediction.bearishSignals.toFixed(2)}</div>
                    </div>
                </div>
            </div>
            
            <!-- Comparison Summary -->
            <div class="comparison-summary" style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 10px; text-align: center;">
                <h5 style="color: #fff; margin-bottom: 15px; font-size: 16px;">📊 Prediction Comparison</h5>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                    <div>
                        <div style="font-size: 12px; color: #ccc; margin-bottom: 5px;">3-Month Range</div>
                        <div style="font-size: 14px; color: #fff;">
                            ${window.formatPrice ? window.formatPrice(shortTermPrediction.predictedLow) : `$${shortTermPrediction.predictedLow.toLocaleString()}`} - 
                            ${window.formatPrice ? window.formatPrice(shortTermPrediction.predictedHigh) : `$${shortTermPrediction.predictedHigh.toLocaleString()}`}
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 12px; color: #ccc; margin-bottom: 5px;">4-Year Range</div>
                        <div style="font-size: 14px; color: #fff;">
                            ${window.formatPrice ? window.formatPrice(longTermPrediction.predictedLow) : `$${longTermPrediction.predictedLow.toLocaleString()}`} - 
                            ${window.formatPrice ? window.formatPrice(longTermPrediction.predictedHigh) : `$${longTermPrediction.predictedHigh.toLocaleString()}`}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    predictNext4Years() {
        const timeframes = ['daily', 'weekly', 'monthly', 'yearly'];
        const current = this.currentPrice;
        
        // 1. Long-term trend analysis (weighted differently)
        let bullishSignals = 0;
        let bearishSignals = 0;
        let totalSignals = 0;
        
        // Different weights for long-term prediction
        const weights = {
            yearly: 0.50,    // 50% - most important for long-term
            monthly: 0.30,   // 30% - medium importance
            weekly: 0.15,    // 15% - less important
            daily: 0.05      // 5% - least important
        };
        
        timeframes.forEach(tf => {
            const data = this.timeframes[tf];
            if (!data || !data.levels) return;
            
            const levels = data.levels;
            const weight = weights[tf];
            
            // Check position relative to pivot
            if (current > levels.pivot) {
                bullishSignals += weight;
            } else if (current < levels.pivot) {
                bearishSignals += weight;
            }
            totalSignals += weight;
            
            // Check momentum (distance from support/resistance)
            const distanceToR1 = Math.abs(current - levels.r1);
            const distanceToS1 = Math.abs(current - levels.s1);
            
            if (distanceToR1 < distanceToS1) {
                bullishSignals += weight * 0.5; // Closer to resistance = potential breakout
            } else {
                bearishSignals += weight * 0.5; // Closer to support = potential breakdown
            }
        });
        
        // 2. Calculate long-term trend strength
        const trendStrength = (bullishSignals - bearishSignals) / totalSignals;
        
        // 3. Predict price ranges for next 4 years using YEARLY levels
        const yearlyData = this.timeframes.yearly;
        let predictedHigh = current;
        let predictedLow = current;
        let confidence = 'MEDIUM';
        let highlightedTarget = 'NONE';
        
        if (yearlyData && yearlyData.levels) {
            const yearlyLevels = yearlyData.levels;
            
            // Calculate current position relative to yearly levels
            const currentToR1 = ((current - yearlyLevels.r1) / yearlyLevels.r1) * 100;
            const currentToS1 = ((current - yearlyLevels.s1) / yearlyLevels.s1) * 100;
            const currentToPivot = ((current - yearlyLevels.pivot) / yearlyLevels.pivot) * 100;
            
            if (trendStrength > 0.3) {
                // Bullish long-term prediction
                predictedHigh = yearlyLevels.r4 || current * 1.80;  // R4 for 4 years
                predictedLow = yearlyLevels.s1 || current * 0.50;   // ← UBAH: Guna S1 yearly sahaja
                confidence = 'HIGH';
                highlightedTarget = 'HIGH';
            } else if (trendStrength < -0.3) {
                // Bearish long-term prediction
                predictedHigh = yearlyLevels.r2 || current * 1.20;  // R2 as resistance
                predictedLow = yearlyLevels.s1 || current * 0.50;   // ← UBAH: Guna S1 yearly sahaja
                confidence = 'HIGH';
                highlightedTarget = 'LOW';
            } else {
                // Neutral long-term prediction
                predictedHigh = yearlyLevels.r3 || current * 1.50;  // R3 for neutral
                predictedLow = yearlyLevels.s1 || current * 0.60;   // ← UBAH: Guna S1 yearly sahaja
                confidence = 'MEDIUM';
                
                // For neutral, determine highlight based on position
                if (Math.abs(currentToPivot) < 5) {
                    highlightedTarget = 'NONE';
                } else if (currentToR1 > -10 && currentToR1 < 10) {
                    highlightedTarget = 'LOW';
                } else if (currentToS1 > -10 && currentToS1 < 10) {
                    highlightedTarget = 'HIGH';
                } else {
                    highlightedTarget = 'NONE';
                }
            }
        }
        
        // 4. Calculate long-term probability ranges
        const prediction = {
            currentPrice: current,
            predictedHigh: predictedHigh,
            predictedLow: predictedLow,
            trendStrength: trendStrength,
            confidence: confidence,
            highlightedTarget: highlightedTarget,
            timeframe: '4 Years',
            bullishSignals: bullishSignals,
            bearishSignals: bearishSignals,
            totalSignals: totalSignals,
            analysis: this.generateLongTermAnalysis(trendStrength, predictedHigh, predictedLow)
        };
        
        return prediction;
    }

    generateLongTermAnalysis(trendStrength, predictedHigh, predictedLow) {
        let analysis = '';
        
        if (trendStrength > 0.5) {
            analysis = `Strong long-term bullish momentum detected. Price likely to experience significant growth over 4 years with potential targets above ${window.formatPrice ? window.formatPrice(predictedHigh) : `$${predictedHigh.toLocaleString()}`}. This suggests a major bull market cycle.`;
        } else if (trendStrength > 0.2) {
            analysis = `Moderate long-term bullish bias. Expect gradual but sustained upward movement over 4 years with resistance at ${window.formatPrice ? window.formatPrice(predictedHigh) : `$${predictedHigh.toLocaleString()}`}. This indicates a positive long-term outlook.`;
        } else if (trendStrength < -0.5) {
            analysis = `Strong long-term bearish pressure. Price may experience significant decline over 4 years with potential support at ${window.formatPrice ? window.formatPrice(predictedLow) : `$${predictedLow.toLocaleString()}`}. This suggests a major bear market cycle.`;
        } else if (trendStrength < -0.2) {
            analysis = `Moderate long-term bearish bias. Expect downward movement over 4 years with support at ${window.formatPrice ? window.formatPrice(predictedLow) : `$${predictedLow.toLocaleString()}`}. This indicates a challenging long-term outlook.`;
        } else {
            analysis = `Neutral long-term market conditions. Price likely to consolidate between ${window.formatPrice ? window.formatPrice(predictedLow) : `$${predictedLow.toLocaleString()}`} and ${window.formatPrice ? window.formatPrice(predictedHigh) : `$${predictedHigh.toLocaleString()}`} over 4 years. This suggests a sideways market with moderate volatility.`;
        }
        
        return analysis;
    }

    updateLongTermPredictionDisplay() {
        const prediction = this.predictNext4Years();
        
        const predictionContent = document.getElementById('longterm-prediction-content');
        if (!predictionContent || predictionContent.style.display === 'none') {
            return;
        }
        
        const predictionContainer = document.getElementById('longterm-prediction-container');
        if (!predictionContainer) return;
        
        const confidenceColor = prediction.confidence === 'HIGH' ? '#16c784' : 
                               prediction.confidence === 'MEDIUM' ? '#ffa500' : '#ff4b4b';
        
        const trendColor = prediction.trendStrength > 0.2 ? '#16c784' : 
                          prediction.trendStrength < -0.2 ? '#ff4b4b' : '#ffffff';
        
        // Highlight styling for long-term
        const highStyle = prediction.highlightedTarget === 'HIGH' ? 
            'background: rgba(22, 199, 132, 0.3); border: 3px solid #16c784; box-shadow: 0 0 20px rgba(22, 199, 132, 0.4);' : 
            'background: rgba(255,255,255,0.1);';
        
        const lowStyle = prediction.highlightedTarget === 'LOW' ? 
            'background: rgba(255, 75, 75, 0.3); border: 3px solid #ff4b4b; box-shadow: 0 0 20px rgba(255, 75, 75, 0.4);' : 
            'background: rgba(255,255,255,0.1);';
        
        // Long-term trajectory indicator
        const trajectoryIcon = prediction.highlightedTarget === 'HIGH' ? '🚀' : 
                              prediction.highlightedTarget === 'LOW' ? '📉' : '➡️';
        
        const trajectoryText = prediction.highlightedTarget === 'HIGH' ? 'LONG-TERM BULLISH' :
                              prediction.highlightedTarget === 'LOW' ? 'LONG-TERM BEARISH' : 
                              'LONG-TERM NEUTRAL';
        
        predictionContainer.innerHTML = `
            <div class="prediction-header" style="text-align: center; margin-bottom: 30px;">
                <h3 style="color: #fff; margin-bottom: 10px;">🎯 4-Year Long-Term Prediction</h3>
                <div class="prediction-confidence" style="color: ${confidenceColor}; font-weight: bold; font-size: 18px;">
                    Confidence: ${prediction.confidence}
                </div>
                <div style="margin-top: 10px; font-size: 16px; color: #ccc;">
                    ${trajectoryIcon} ${trajectoryText}
                </div>
            </div>
            
            <div class="prediction-details" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px;">
                <div class="prediction-item" style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 14px; color: #ccc; margin-bottom: 8px;">Current Price</div>
                    <div style="font-size: 24px; font-weight: bold; color: #fff;">${window.formatPrice ? window.formatPrice(prediction.currentPrice) : `$${prediction.currentPrice.toLocaleString()}`}</div>
                </div>
                
                <div class="prediction-item" style="${highStyle} padding: 20px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 14px; color: #ccc; margin-bottom: 8px;">
                        ${prediction.highlightedTarget === 'HIGH' ? '🎯 LONG-TERM TARGET' : 'Predicted High (4Y)'}
                    </div>
                    <div style="font-size: 24px; font-weight: bold; color: #16c784">${window.formatPrice ? window.formatPrice(prediction.predictedHigh) : `$${prediction.predictedHigh.toLocaleString()}`}</div>
                </div>
                
                <div class="prediction-item" style="${lowStyle} padding: 20px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 14px; color: #ccc; margin-bottom: 8px;">
                        ${prediction.highlightedTarget === 'LOW' ? '🎯 LONG-TERM TARGET' : 'Predicted Low (4Y)'}
                    </div>
                    <div style="font-size: 24px; font-weight: bold; color: #ff4b4b">${window.formatPrice ? window.formatPrice(prediction.predictedLow) : `$${prediction.predictedLow.toLocaleString()}`}</div>
                </div>
                
                <div class="prediction-item" style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 14px; color: #ccc; margin-bottom: 8px;">Long-Term Trend</div>
                    <div style="font-size: 24px; font-weight: bold; color: ${trendColor}">${(prediction.trendStrength * 100).toFixed(1)}%</div>
                </div>
            </div>
            
            <div class="prediction-analysis" style="background: rgba(255,255,255,0.05); padding: 25px; border-radius: 10px; margin-bottom: 30px;">
                <h4 style="color: #fff; margin-bottom: 15px; font-size: 18px;"> Long-Term Analysis</h4>
                <p style="color: #ccc; line-height: 1.6; font-size: 16px;">${prediction.analysis}</p>
            </div>
            
            <div class="prediction-signals" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                <div class="signal-item" style="background: rgba(22, 199, 132, 0.1); padding: 20px; border-radius: 10px; text-align: center; border: 1px solid rgba(22, 199, 132, 0.3);">
                    <div style="font-size: 14px; color: #ccc; margin-bottom: 8px;">Bullish Signals (Weighted)</div>
                    <div style="font-size: 24px; font-weight: bold; color: #16c784">${prediction.bullishSignals.toFixed(2)}</div>
                </div>
                <div class="signal-item" style="background: rgba(255, 75, 75, 0.1); padding: 20px; border-radius: 10px; text-align: center; border: 1px solid rgba(255, 75, 75, 0.3);">
                    <div style="font-size: 14px; color: #ccc; margin-bottom: 8px;">Bearish Signals (Weighted)</div>
                    <div style="font-size: 24px; font-weight: bold; color: #ff4b4b">${prediction.bearishSignals.toFixed(2)}</div>
                </div>
            </div>
        `;
    }
}

// Add formatSRLevel helper at top-level
function formatSRLevel(val) {
    if (typeof val !== 'number' || isNaN(val) || val < 0) return '-';
    return window.formatPrice ? window.formatPrice(val) : val.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
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
            } else if (timeframe === 'calculator') {
                if (chartCanvas) chartCanvas.style.display = 'none';
                if (summaryCards) summaryCards.style.display = 'none';
                if (converterWrapper) converterWrapper.style.display = 'none';
            } else if (timeframe === 'reference') {
                if (chartCanvas) chartCanvas.style.display = 'none';
                if (summaryCards) summaryCards.style.display = 'none';
                if (converterWrapper) converterWrapper.style.display = 'none';
            } else if (timeframe === 'prediction') {
                if (chartCanvas) chartCanvas.style.display = 'none';
                if (summaryCards) summaryCards.style.display = 'none';
                if (converterWrapper) converterWrapper.style.display = 'none';
                // Update prediction display when prediction tab is active
                if (window.calculator) {
                    window.calculator.updatePredictionDisplay();
                }
            } else { // Default to chart if not summary, converter, calculator, reference, or prediction
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
    // Prevent chart update if calculator, reference, or prediction tab is active
    if (timeframe === 'calculator' || timeframe === 'reference' || timeframe === 'prediction') return;
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
        // Use exchangerate-api.com which doesn't require API key
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        console.log('Exchange rates response:', data);
        
        converterRates.MYR = data.rates.MYR;
        converterRates.CNY = data.rates.CNY;
        converterRates.IDR = data.rates.IDR;
        window.converterRates = converterRates;
        
        console.log('Rates loaded:', converterRates);
        updateConverterRateInfo();
        
    } catch (error) {
        console.error('Exchange rate fetch error:', error);
        
        // Use fallback rates
        converterRates.MYR = 4.25;
        converterRates.CNY = 7.20;
        converterRates.IDR = 15800;
        window.converterRates = converterRates;
        
        const rateInfo = document.getElementById('converter-rate-info');
        if (rateInfo) {
            rateInfo.innerHTML = 
            'Using fallback rates (live rates unavailable)<br>' +
            '<small>1 USD = 4.25 MYR | 7.20 CNY | 15,800 IDR</small>';
        }
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
        const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
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
    ['daily', 'weekly', 'monthly', 'yearly'].forEach(timeframe => {
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
    
    // Update prediction display - TAMBAH INI
    if (window.calculator) {
        window.calculator.updatePredictionDisplay();
    }
    
    // Update chart if it exists and is visible
    if (window.btcChart && window.calculator) {
        const currentTimeframe = window.calculator.currentTimeframe;
        if (currentTimeframe && currentTimeframe !== 'summary' && currentTimeframe !== 'converter' && currentTimeframe !== 'calculator') {
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
        tableHTML += `<td>${formatSRLevel(window.calculator?.timeframes.daily.levels[level]) || '-'}</td>`;
        tableHTML += `<td>${formatSRLevel(window.calculator?.timeframes.weekly.levels[level]) || '-'}</td>`;
        tableHTML += `<td>${formatSRLevel(window.calculator?.timeframes.monthly.levels[level]) || '-'}</td>`;
        tableHTML += `<td>${formatSRLevel(window.calculator?.timeframes.yearly.levels[level]) || '-'}</td>`;
        tableHTML += '</tr>';
    });
    
    tableBody.innerHTML = tableHTML;
}

function updateSummaryTabCurrency() {
    const timeframes = ['daily', 'weekly', 'monthly', 'yearly'];
    timeframes.forEach(tf => {
        const data = window.calculator?.timeframes?.[tf];
        const levels = data.levels;
        let srSuggestion = '-', vtSuggestion = '-', taSuggestion = '-';
        let taTarget = '';
        let hvSuggestion = '-';
        let info = '';
        if (levels && data.high && data.low && data.close) {
            const current = window.calculator?.currentPrice || 0;

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
            // Logic dinamik: cari resistance/support terdekat dari current price
            const resistanceLevels = ['r1', 'r2', 'r3', 'r4'];
            const supportLevels = ['s1', 's2', 's3', 's4'];
            let nextTargetLevel = null, nextSupportLevel = null;
            for (let i = 0; i < resistanceLevels.length; i++) {
                const lvl = levels[resistanceLevels[i]];
                if (lvl > current) {
                    nextTargetLevel = lvl;
                    break;
                }
            }
            for (let i = 0; i < supportLevels.length; i++) {
                const lvl = levels[supportLevels[i]];
                if (lvl < current) {
                    nextSupportLevel = lvl;
                    break;
                }
            }
            // Jika tiada support di bawah, cari support seterusnya (S2, S3, S4)
            if (nextSupportLevel === null) {
                for (let i = 0; i < supportLevels.length; i++) {
                    const lvl = levels[supportLevels[i]];
                    if (lvl > 0) {
                        nextSupportLevel = lvl;
                        break;
                    }
                }
            }
            if (taSuggestion === 'HOLD' || taSuggestion === 'CAUTION') {
                taTarget = `
                    <div class='next-target' style='margin-bottom:0;'>Next Target: <b>${window.formatPrice ? window.formatPrice(nextTargetLevel) : (nextTargetLevel ?? '-')}</b></div>
                    <div class='next-target last-next-target'>Next Support: <b>${window.formatPrice ? window.formatPrice(nextSupportLevel) : (nextSupportLevel ?? '-')}</b></div>
                `;
            } else if (taSuggestion.includes('BUY')) {
                taTarget = `<div class='next-target last-next-target'>Next Target: <b>${window.formatPrice ? window.formatPrice(nextTargetLevel) : (nextTargetLevel ?? '-')}</b></div>`;
            } else if (taSuggestion.includes('SELL') || taSuggestion === 'LOCK PROFIT') {
                taTarget = `<div class='next-target last-next-target'>Next Support: <b>${window.formatPrice ? window.formatPrice(nextSupportLevel) : (nextSupportLevel ?? '-')}</b></div>`;
            }

            // Determine which has more volume
            const buyVol = data.volumeData?.[data.high]?.buy || 0;
            const sellVol = data.volumeData?.[data.low]?.sell || 0;
            const highlightBought = buyVol >= sellVol;
            const highlightSold = sellVol > buyVol;
            const mostBoughtStyle = highlightBought ? 'color:#16c784;font-weight:bold;' : '';
            const mostSoldStyle = highlightSold ? 'color:#ff4b4b;font-weight:bold;' : '';
            // Add color styling for SR, VT, HV suggestions
            const getSuggestionColor = (suggestion) => {
                if (suggestion === 'BUY') return 'color:#16c784;font-weight:bold;';
                if (suggestion === 'SELL' || suggestion === 'LOCK PROFIT') return 'color:#ff4b4b;font-weight:bold;';
                return 'color:#ffffff;font-weight:bold;';
            };
            
            const srColor = getSuggestionColor(srSuggestion);
            const vtColor = getSuggestionColor(vtSuggestion);
            const hvColor = getSuggestionColor(hvSuggestion);
            
            info = `
                ${taTarget}
                <div><b>SR</b>: <span style="${srColor}">${srSuggestion}</span></div>
                <div><b>VT</b>: <span style="${vtColor}">${vtSuggestion}</span></div>
                <div><b>HV</b>: <span style="${hvColor}">${hvSuggestion}</span></div>
                <div style="margin-top:8px;">Current Price: <b>${window.formatPrice ? window.formatPrice(current) : current}</b></div>
                <div style='${mostBoughtStyle}'>Most Bought: <b>${window.formatPrice ? window.formatPrice(data.high) : data.high}</b></div>
                <div style='${mostSoldStyle}'>Most Sold: <b>${window.formatPrice ? window.formatPrice(data.low) : data.low}</b></div>
            `;
        }
        
        // === ADDED BACK: Display individual timeframe suggestions ===
        // Papar TA dengan color coding
        const taElement = document.getElementById(`summary-${tf}-suggestion`);
        if (taElement) {
            taElement.textContent = taSuggestion;
            
            // Add color coding based on TA suggestion
            if (taSuggestion === 'BUY') {
                taElement.style.color = '#16c784'; // Green
                taElement.style.fontWeight = 'bold';
            } else if (taSuggestion === 'SELL' || taSuggestion === 'LOCK PROFIT') {
                taElement.style.color = '#ff4b4b'; // Red
                taElement.style.fontWeight = 'bold';
            } else {
                taElement.style.color = '#ffffff'; // White (default)
                taElement.style.fontWeight = 'normal';
            }
        }
        
        // Papar next target/support TA di bawah, kemudian SR & VT & HV, kemudian info harga
        const infoElement = document.getElementById(`summary-${tf}-info`);
        if (infoElement) {
            infoElement.innerHTML = info;
        }
    });
}

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
    // Use average S/R levels from all timeframes (like calculator tab)
    const timeframes = ['daily', 'weekly', 'monthly', 'yearly'];
    let avgLevels = { s4: 0, s3: 0, s2: 0, s1: 0, pivot: 0, r1: 0, r2: 0, r3: 0, r4: 0 };
    let validLevels = { s4: 0, s3: 0, s2: 0, s1: 0, pivot: 0, r1: 0, r2: 0, r3: 0, r4: 0 };
    
    // Kumpul semua S/R levels dari semua timeframes
    timeframes.forEach(tf => {
        const tfLevels = window.calculator?.timeframes?.[tf]?.levels || {};
        if (tfLevels.s4 && !isNaN(tfLevels.s4)) { avgLevels.s4 += tfLevels.s4; validLevels.s4++; }
        if (tfLevels.s3 && !isNaN(tfLevels.s3)) { avgLevels.s3 += tfLevels.s3; validLevels.s3++; }
        if (tfLevels.s2 && !isNaN(tfLevels.s2)) { avgLevels.s2 += tfLevels.s2; validLevels.s2++; }
        if (tfLevels.s1 && !isNaN(tfLevels.s1)) { avgLevels.s1 += tfLevels.s1; validLevels.s1++; }
        if (tfLevels.pivot && !isNaN(tfLevels.pivot)) { avgLevels.pivot += tfLevels.pivot; validLevels.pivot++; }
        if (tfLevels.r1 && !isNaN(tfLevels.r1)) { avgLevels.r1 += tfLevels.r1; validLevels.r1++; }
        if (tfLevels.r2 && !isNaN(tfLevels.r2)) { avgLevels.r2 += tfLevels.r2; validLevels.r2++; }
        if (tfLevels.r3 && !isNaN(tfLevels.r3)) { avgLevels.r3 += tfLevels.r3; validLevels.r3++; }
        if (tfLevels.r4 && !isNaN(tfLevels.r4)) { avgLevels.r4 += tfLevels.r4; validLevels.r4++; }
    });
    
    // Kira average untuk setiap level
    Object.keys(avgLevels).forEach(key => {
        avgLevels[key] = validLevels[key] > 0 ? avgLevels[key] / validLevels[key] : null;
    });
    
    const current = window.calculator?.currentPrice || 0;
    // Get BTC input value
    const btcInput = document.getElementById('conv-btc-main');
    const btcAmount = btcInput ? parseFloat(btcInput.value) || 0 : 0;
    // Get S/R target info from TA logic (same as summary tab)
    let srTargets = [];
    // Next Target & Next Support logic (from summary)
    let taSuggestion = '-';
    if (current <= avgLevels.s1 * 1.01) taSuggestion = 'BUY';
    else if (current >= avgLevels.r1 * 0.99) taSuggestion = 'SELL';
    else taSuggestion = 'HOLD';
    
    // Cari next target dan next support dinamik berdasarkan average levels
    const resistanceLevels = ['r1', 'r2', 'r3', 'r4'];
    const supportLevels = ['s1', 's2', 's3', 's4'];
    let nextTargetLevel = null, nextSupportLevel = null;
    
    // Cari next target (resistance terdekat di atas current price)
    for (let i = 0; i < resistanceLevels.length; i++) {
        const lvl = avgLevels[resistanceLevels[i]];
        if (lvl && lvl > current) {
            nextTargetLevel = lvl;
            break;
        }
    }
    
    // Cari next support (support terdekat di bawah current price)
    for (let i = 0; i < supportLevels.length; i++) {
        const lvl = avgLevels[supportLevels[i]];
        if (lvl && lvl < current) {
            nextSupportLevel = lvl;
            break;
        }
    }
    
    // Jika tiada support di bawah, cari support seterusnya (S2, S3, S4)
    if (nextSupportLevel === null) {
        for (let i = 0; i < supportLevels.length; i++) {
            const lvl = avgLevels[supportLevels[i]];
            if (lvl && lvl > 0) {
                nextSupportLevel = lvl;
                break;
            }
        }
    }
    
    if (taSuggestion === 'HOLD' || taSuggestion === 'CAUTION') {
        srTargets.push({ label: 'Mid/Short Potential Gain', value: nextTargetLevel || avgLevels.r1, multiply: true });
        srTargets.push({ label: 'Mid/Short Potential Risk', value: nextSupportLevel || avgLevels.s1, multiply: true });
    } else if (taSuggestion.includes('BUY')) {
        srTargets.push({ label: 'Mid/Short Potential Gain', value: nextTargetLevel || avgLevels.r1, multiply: true });
    } else if (taSuggestion.includes('SELL') || taSuggestion === 'LOCK PROFIT') {
        srTargets.push({ label: 'Mid/Short Potential Risk', value: nextSupportLevel || avgLevels.s1, multiply: true });
    }
    srTargets.push({ label: 'Current Price', value: current, multiply: false });
    // Calculate average most bought/sold from summary timeframes
    const tfs = ['daily', 'weekly', 'monthly', 'yearly'];
    let sumHigh = 0, sumLow = 0, countHigh = 0, countLow = 0;
    tfs.forEach(tf => {
        const tfData = window.calculator?.timeframes?.[tf];
        if (tfData && typeof tfData.high === 'number' && !isNaN(tfData.high)) {
            sumHigh += tfData.high;
            countHigh++;
        }
        if (tfData && typeof tfData.low === 'number' && !isNaN(tfData.low)) {
            sumLow += tfData.low;
            countLow++;
        }
    });
    const avgMostBought = countHigh > 0 ? sumHigh / countHigh : null;
    const avgMostSold = countLow > 0 ? sumLow / countLow : null;
    srTargets.push({ label: 'Average Most Bought', value: avgMostBought, multiply: false });
    srTargets.push({ label: 'Average Most Sold', value: avgMostSold, multiply: false });
    // Multiply only those with multiply: true by BTC input
    const srTargetsWithAmount = srTargets.map(tgt => ({
        label: tgt.label,
        value: tgt.multiply ? tgt.value * btcAmount : tgt.value
    }));
    // Calculate delta for Potential Gain/Risk
    const mainTargets = [];
    if (btcAmount > 0) {
        // Potential Gain
        if (typeof nextTargetLevel === 'number' && !isNaN(nextTargetLevel)) {
            const gain = (nextTargetLevel - current) * btcAmount;
            mainTargets.push({
                label: 'Potential Gain',
                value: gain,
                className: 'sr-gain', // always green
                sign: gain >= 0 ? '+' : ''
            });
        }
        // Potential Risk
        if (typeof nextSupportLevel === 'number' && !isNaN(nextSupportLevel)) {
            let risk = 0;
            if (nextSupportLevel < current) {
                risk = (current - nextSupportLevel) * btcAmount;
            } else {
                // Jika next support lebih tinggi/sama dengan current price, cari support seterusnya
                for (let i = 0; i < supportLevels.length; i++) {
                    const lvl = avgLevels[supportLevels[i]];
                    if (lvl && lvl < current && lvl > 0) {
                        risk = (current - lvl) * btcAmount;
                        break;
                    }
                }
            }
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
    const infoTargets = srTargetsWithAmount.filter(tgt => tgt.label === 'Current Price' || tgt.label === 'Most Bought' || tgt.label === 'Most Sold' || tgt.label === 'Average Most Bought' || tgt.label === 'Average Most Sold');
    // Get yearly volume info for highlight logic
    const yearly = window.calculator?.timeframes?.yearly;
    const yearlyBuyVol = yearly?.volumeData?.[yearly?.high]?.buy || 0;
    const yearlySellVol = yearly?.volumeData?.[yearly?.low]?.sell || 0;
    const highlightAvgBought = yearlyBuyVol >= yearlySellVol;
    const highlightAvgSold = yearlySellVol > yearlyBuyVol;
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
                html += `<li><span class='sr-label'>${tgt.label.replace('Potential Gain', 'Mid/Short Potential Gain').replace('Potential Risk', 'Mid/Short Potential Risk')}:</span> <span class='sr-value'>-</span></li>`;
            } else {
                html += `<li><span class='sr-label'>${tgt.label.replace('Potential Gain', 'Mid/Short Potential Gain').replace('Potential Risk', 'Mid/Short Potential Risk')}:</span> <span class='sr-value ${tgt.className}'>${tgt.sign}${cur.format(Math.abs(tgt.value))}</span></li>`;
            }
        });
        // === Long Term Potential Gain/Risk (Yearly S/R) ===
        const yearlyLevels = window.calculator?.timeframes?.yearly?.levels;
        if (
            btcAmount > 0 &&
            yearlyLevels &&
            typeof yearlyLevels.r1 === 'number' && !isNaN(yearlyLevels.r1) &&
            typeof yearlyLevels.s1 === 'number' && !isNaN(yearlyLevels.s1)
        ) {
            const current = window.calculator?.currentPrice || 0;
            const longGain = (yearlyLevels.r1 - current) * btcAmount;
            const longRisk = (current - yearlyLevels.s1) * btcAmount;
            html += `<li><span class='sr-label'>Long Term Potential Gain:</span> <span class='sr-value sr-gain'>${longGain >= 0 ? '+' : ''}${cur.format(Math.abs(longGain))}</span></li>`;
            html += `<li><span class='sr-label'>Long Term Potential Risk:</span> <span class='sr-value sr-risk'>-${cur.format(Math.abs(longRisk))}</span></li>`;
        } else {
            html += `<li><span class='sr-label'>Long Term Potential Gain:</span> <span class='sr-value'>-</span></li>`;
            html += `<li><span class='sr-label'>Long Term Potential Risk:</span> <span class='sr-value'>-</span></li>`;
        }
        html += '</ul>';
        html += '<ul class="sr-target-list-info">';
        infoTargets.forEach(tgt => {
            let highlight = '';
            if (tgt.label === 'Average Most Bought' && highlightAvgBought) highlight = " style='color:#16c784;font-weight:bold;'";
            if (tgt.label === 'Average Most Sold' && highlightAvgSold) highlight = " style='color:#ff4b4b;font-weight:bold;'";
            html += `<li><span class='sr-label'${highlight}>${tgt.label}:</span> <span class='sr-value'${highlight}>${tgt.value ? cur.format(tgt.value) : '-'}</span></li>`;
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
    const timeframes = ['daily', 'weekly', 'monthly', 'yearly'];
    const labels = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
    // === UPDATED: New weight distribution sama seperti summary ===
    const weights = { 
        monthly: 0.45,  // 45% - paling tinggi
        daily: 0.20,    // 20% - kedua
        yearly: 0.10,   // 10% - ketiga
        weekly: 0.05    // 5% - paling rendah
    }; // Total: 80% untuk timeframe signals
    
    let totalScore = 0;
    let totalWeight = 0;
    let trendAnalysis = { uptrend: 0, downtrend: 0, neutral: 0 }; // Track trend signals
    
    timeframes.forEach(tf => {
        const data = window.calculator?.timeframes?.[tf];
        const el = document.getElementById(`converter-ta-${tf}`);
        if (!data || !data.levels || !el) return;
        
        const levels = data.levels;
        const current = window.calculator?.currentPrice || 0;
        let srSuggestion = '-', vtSuggestion = '-', hvSuggestion = '-', trendSuggestion = '-', taSuggestion = '-';
        
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
        
        // HV suggestion
        let highVolumeBuy = data.volumeData?.[data.high]?.buy || 0;
        let highVolumeSell = data.volumeData?.[data.low]?.sell || 0;
        if (highVolumeBuy > highVolumeSell) {
            hvSuggestion = 'BUY';
        } else if (highVolumeSell > highVolumeBuy) {
            hvSuggestion = 'SELL';
        } else {
            hvSuggestion = 'HOLD';
        }
        
        // === UPDATED: Weighted average with 3 signals only for individual timeframes ===
        // Weighted TA logic (SR: 45%, HV: 35%, VT: 20%)
        const signalWeights = { SR: 0.45, HV: 0.35, VT: 0.20 };
        let totalSignalScore = 0;
        let totalSignalWeight = 0;
        
        // Calculate weighted score for each signal
        const signals = [
            { type: 'SR', suggestion: srSuggestion, weight: signalWeights.SR },
            { type: 'HV', suggestion: hvSuggestion, weight: signalWeights.HV },
            { type: 'VT', suggestion: vtSuggestion, weight: signalWeights.VT }
        ];
        
        signals.forEach(signal => {
            let score = 0;
            if (signal.suggestion === 'BUY') score = 1;
            else if (signal.suggestion === 'SELL' || signal.suggestion === 'LOCK PROFIT') score = -1;
            else score = 0;
            
            totalSignalScore += score * signal.weight;
            totalSignalWeight += signal.weight;
        });
        
        // Determine final TA suggestion for individual timeframe
        if (totalSignalWeight > 0) {
            const averageScore = totalSignalScore / totalSignalWeight;
            if (averageScore >= 0.3) {
                taSuggestion = 'BUY';
            } else if (averageScore <= -0.3) {
                taSuggestion = 'SELL';
            } else {
                taSuggestion = 'HOLD';
            }
        } else {
            taSuggestion = 'HOLD';
        }
        
        // === UPDATED: Trend Analysis Logic dengan weight 20% ===
        const mostBoughtPrice = data.high;
        const mostSoldPrice = data.low;
        
        if (mostBoughtPrice > 0 && mostSoldPrice > 0) {
            const currentToBoughtPercent = ((current - mostBoughtPrice) / mostBoughtPrice) * 100;
            const currentToSoldPercent = ((current - mostSoldPrice) / mostSoldPrice) * 100;
            
            // Logic: If current price is within 5% above Most Bought → UPTREND
            if (currentToBoughtPercent >= -5 && currentToBoughtPercent <= 5) {
                trendSuggestion = 'BUY'; // Uptrend signal
                trendAnalysis.uptrend += 0.20; // 20% weight untuk trend
            }
            // Logic: If current price is below 5% from Most Sold → DOWNTREND
            else if (currentToSoldPercent <= -5) {
                trendSuggestion = 'SELL'; // Downtrend signal
                trendAnalysis.downtrend += 0.20; // 20% weight untuk trend
            }
            // Logic: If not uptrend or downtrend → NEUTRAL
            else {
                trendSuggestion = 'HOLD'; // Neutral signal
                trendAnalysis.neutral += 0.20; // 20% weight untuk trend
            }
        } else {
            trendSuggestion = 'HOLD';
            trendAnalysis.neutral += 0.20; // 20% weight untuk trend
        }
        
        // Calculate weighted score untuk timeframe signals (80% total)
        let score = 0;
        if (taSuggestion === 'BUY') score = 1;
        else if (taSuggestion === 'SELL' || taSuggestion === 'LOCK PROFIT') score = -1;
        else score = 0;
        
        totalScore += score * weights[tf]; // 80% dari timeframe signals
        totalWeight += weights[tf]; // 80% total weight
        
        let className = '';
        if (taSuggestion === 'BUY') className = 'converter-ta-buy';
        else if (taSuggestion === 'SELL') className = 'converter-ta-sell';
        else className = 'converter-ta-hold';
        
        el.innerHTML = `<div class='converter-ta-suggestion-row'><div class='converter-ta-label'>${labels[tf]}</div><div class='converter-ta-value ${className}'>${taSuggestion}</div></div>`;
    });
    
    // === UPDATED: Calculate combined TA suggestion dengan 80% timeframe + 20% trend ===
    let combinedTA = 'HOLD';
    let combinedClassName = 'converter-ta-hold';
    
    if (totalWeight > 0) {
        const averageScore = totalScore / totalWeight; // 80% timeframe signals
        if (averageScore >= 0.3) {
            combinedTA = 'BUY';
            combinedClassName = 'converter-ta-buy';
        } else if (averageScore <= -0.3) {
            combinedTA = 'SELL';
            combinedClassName = 'converter-ta-sell';
        }
    }
    
    // === UPDATED: Determine dominant trend (20% weight) ===
    let dominantTrend = 'NEUTRAL';
    let trendColor = '#ffffff'; // White for neutral
    
    // Find the highest weighted trend (20% weight)
    if (trendAnalysis.uptrend > trendAnalysis.downtrend && trendAnalysis.uptrend > trendAnalysis.neutral) {
        dominantTrend = 'UPTREND';
        trendColor = '#16c784'; // Green for uptrend
    } else if (trendAnalysis.downtrend > trendAnalysis.uptrend && trendAnalysis.downtrend > trendAnalysis.neutral) {
        dominantTrend = 'DOWNTREND';
        trendColor = '#ff4b4b'; // Red for downtrend
    } else {
        dominantTrend = 'NEUTRAL';
        trendColor = '#ffffff'; // White for neutral
    }
    
    // Update combined TA display with trend information
    const combinedEl = document.getElementById('converter-ta-combined');
    if (combinedEl) {
        const combinedValueEl = combinedEl.querySelector('.combined-ta-value');
        if (combinedValueEl) {
            // Display both combined TA and trend
            combinedValueEl.innerHTML = `
                <div style="font-size: 1.2em; font-weight: bold; margin-bottom: 5px;">${combinedTA}</div>
                <div style="font-size: 0.6em; color: ${trendColor}; font-weight: bold;">${dominantTrend}</div>
            `;
            
            // Color coding for combined TA
            if (combinedTA === 'BUY') {
                combinedValueEl.style.color = '#16c784'; // Green
            } else if (combinedTA === 'SELL') {
                combinedValueEl.style.color = '#ff4b4b'; // Red
            } else {
                combinedValueEl.style.color = '#ffffff'; // White
            }
        }
    }
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
    // Get S/R levels ikut timeframe yang sedang dipilih
    const activeTimeframe = window.calculator?.currentTimeframe || 'monthly';
    const levels = window.calculator?.timeframes?.[activeTimeframe]?.levels || {};
    const data = window.calculator?.timeframes?.[activeTimeframe] || {};

    // === Logic average S/R levels dari semua timeframe ===
    const timeframes = ['daily', 'weekly', 'monthly', 'yearly'];
    let avgLevels = { s4: 0, s3: 0, s2: 0, s1: 0, pivot: 0, r1: 0, r2: 0, r3: 0, r4: 0 };
    let validLevels = { s4: 0, s3: 0, s2: 0, s1: 0, pivot: 0, r1: 0, r2: 0, r3: 0, r4: 0 };
    
    // Kumpul semua S/R levels dari semua timeframes
    timeframes.forEach(tf => {
        const tfLevels = window.calculator?.timeframes?.[tf]?.levels || {};
        if (tfLevels.s4 && !isNaN(tfLevels.s4)) { avgLevels.s4 += tfLevels.s4; validLevels.s4++; }
        if (tfLevels.s3 && !isNaN(tfLevels.s3)) { avgLevels.s3 += tfLevels.s3; validLevels.s3++; }
        if (tfLevels.s2 && !isNaN(tfLevels.s2)) { avgLevels.s2 += tfLevels.s2; validLevels.s2++; }
        if (tfLevels.s1 && !isNaN(tfLevels.s1)) { avgLevels.s1 += tfLevels.s1; validLevels.s1++; }
        if (tfLevels.pivot && !isNaN(tfLevels.pivot)) { avgLevels.pivot += tfLevels.pivot; validLevels.pivot++; }
        if (tfLevels.r1 && !isNaN(tfLevels.r1)) { avgLevels.r1 += tfLevels.r1; validLevels.r1++; }
        if (tfLevels.r2 && !isNaN(tfLevels.r2)) { avgLevels.r2 += tfLevels.r2; validLevels.r2++; }
        if (tfLevels.r3 && !isNaN(tfLevels.r3)) { avgLevels.r3 += tfLevels.r3; validLevels.r3++; }
        if (tfLevels.r4 && !isNaN(tfLevels.r4)) { avgLevels.r4 += tfLevels.r4; validLevels.r4++; }
    });
    
    // Kira average untuk setiap level
    Object.keys(avgLevels).forEach(key => {
        avgLevels[key] = validLevels[key] > 0 ? avgLevels[key] / validLevels[key] : null;
    });
    
    // Cari next target dan next support berdasarkan average levels
    const currentPrice = window.calculator?.currentPrice || 0;
    const resistanceLevels = ['r1', 'r2', 'r3', 'r4'];
    const supportLevels = ['s1', 's2', 's3', 's4'];
    let avgNextTarget = null, avgNextSupport = null;
    
    // Cari next target (resistance terdekat di atas current price)
    for (let i = 0; i < resistanceLevels.length; i++) {
        const lvl = avgLevels[resistanceLevels[i]];
        if (lvl && lvl > currentPrice) {
            avgNextTarget = lvl;
            break;
        }
    }
    
    // Cari next support (support terdekat di bawah current price)
    for (let i = 0; i < supportLevels.length; i++) {
        const lvl = avgLevels[supportLevels[i]];
        if (lvl && lvl < currentPrice) {
            avgNextSupport = lvl;
            break;
        }
    }
    
    // Jika tiada support di bawah, cari support seterusnya (S2, S3, S4)
    if (avgNextSupport === null) {
        for (let i = 0; i < supportLevels.length; i++) {
            const lvl = avgLevels[supportLevels[i]];
            if (lvl && lvl > 0) {
                avgNextSupport = lvl;
                break;
            }
        }
    }

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
        const r2 = getPrice(levels.r2 || 0, cur.symbol);
        const s2 = getPrice(levels.s2 || 0, cur.symbol);
        const high = getPrice(data.high || 0, cur.symbol);
        const low = getPrice(data.low || 0, cur.symbol);
        // Output elements
        const profitEl = document.getElementById(`calc-${cur.id}-profit`);
        const srTargetEl = document.getElementById(`calc-sr-target-${cur.id}`);
        // Calculations
        const totalCost = entryPriceCur * btcAmount;
        const currentValue = currentPrice * sellAmount;
        const profitLoss = (currentPrice - entryPriceCur) * sellAmount;
        // === Logic dinamik untuk next target/support berdasarkan average levels ===
        // Gunakan average levels untuk mengira next target dan next support
        let nextTargetLevel = null, nextSupportLevel = null;
        
        // Cari next target berdasarkan average levels
        if (avgNextTarget !== null) {
            nextTargetLevel = getPrice(avgNextTarget, cur.symbol);
        }
        
        // Cari next support berdasarkan average levels
        if (avgNextSupport !== null) {
            nextSupportLevel = getPrice(avgNextSupport, cur.symbol);
        }
        
        // === FIX: Calculate gain and risk for balance BTC ===
        let gain = null, risk = null;
        if (balanceBtc > 0) {
            gain = nextTargetLevel !== null ? (nextTargetLevel - currentPrice) * balanceBtc : null;
            if (nextSupportLevel === null) {
                risk = 0;
            } else if (nextSupportLevel >= currentPrice) {
                // Jika next support lebih tinggi/sama dengan current price, cari support seterusnya dari average levels
                for (let i = 0; i < supportLevels.length; i++) {
                    const avgLvl = avgLevels[supportLevels[i]];
                    if (avgLvl && avgLvl < currentPriceUSD) {
                        const lvl = getPrice(avgLvl, cur.symbol);
                        if (lvl < currentPrice && lvl > 0) {
                            risk = (currentPrice - lvl) * balanceBtc;
                            break;
                        }
                    }
                }
                if (risk === null || risk <= 0) risk = 0;
            } else {
                risk = (currentPrice - nextSupportLevel) * balanceBtc;
            }
        }
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
        srHtml += `<li><span class='sr-label'>Next Target:</span> <span class='sr-value'>${avgNextTarget !== null ? format(getPrice(avgNextTarget, cur.symbol), cur.symbol) : '-'}</span></li>`;
        srHtml += `<li><span class='sr-label'>Next Support:</span> <span class='sr-value'>${avgNextSupport !== null ? format(getPrice(avgNextSupport, cur.symbol), cur.symbol) : '-'}</span></li>`;
        // Calculate average most bought/sold from summary timeframes (always in USD, then convert)
        const tfs = ['daily', 'weekly', 'monthly', 'yearly'];
        let sumHighUSD = 0, sumLowUSD = 0, countHigh = 0, countLow = 0;
        tfs.forEach(tf => {
            const tfData = window.calculator?.timeframes?.[tf];
            if (tfData && typeof tfData.high === 'number' && !isNaN(tfData.high)) {
                sumHighUSD += tfData.high; // always USD
                countHigh++;
            }
            if (tfData && typeof tfData.low === 'number' && !isNaN(tfData.low)) {
                sumLowUSD += tfData.low; // always USD
                countLow++;
            }
        });
        const avgMostBoughtUSD = countHigh > 0 ? sumHighUSD / countHigh : null;
        const avgMostSoldUSD = countLow > 0 ? sumLowUSD / countLow : null;
        const avgMostBought = avgMostBoughtUSD !== null ? getPrice(avgMostBoughtUSD, cur.symbol) : null;
        const avgMostSold = avgMostSoldUSD !== null ? getPrice(avgMostSoldUSD, cur.symbol) : null;
        srHtml += `<li><span class='sr-label'>Average Most Bought:</span> <span class='sr-value'>${avgMostBought ? format(avgMostBought, cur.symbol) : '-'}</span></li>`;
        srHtml += `<li><span class='sr-label'>Average Most Sold:</span> <span class='sr-value'>${avgMostSold ? format(avgMostSold, cur.symbol) : '-'}</span></li>`;
        // Add a dashed line and spacing before balance BTC and below
        srHtml += `<div style="margin:10px 0 8px 0;"><hr style='border:0;border-top:1.5px dashed #888;'></div>`;
        // Portfolio title
        srHtml += `<div class='portfolio-title'>PORTFOLIO</div>`;
        srHtml += '<ul>';
        srHtml += `<li><span class='sr-label'>Balance BTC:</span> <span class='sr-value'>${balanceBtc.toFixed(8)}</span></li>`;
        // Add Current Value above Reward Value
        const currentValueBalance = balanceBtc * currentPrice;
        // Highlight logic for Current Value
        let currentValueClass = '';
        if (profitClass === 'positive') currentValueClass = 'sr-gain';
        else if (profitClass === 'negative') currentValueClass = 'sr-risk';
        srHtml += `<li><span class='sr-label'>Current Value:</span> <span class='sr-value ${currentValueClass}'>${format(currentValueBalance, cur.symbol)}</span></li>`;
        if (gain !== null) srHtml += `<li><span class='sr-label'>Mid/Short Reward Value:</span> <span class='sr-value sr-gain'>${gain >= 0 ? '+' : ''}${format(Math.abs(gain), cur.symbol)}</span></li>`;
        if (risk !== null) {
            const riskValue = risk < 0 ? 0 : risk;
            srHtml += `<li><span class='sr-label'>Mid/Short Risk Value:</span> <span class='sr-value sr-risk'>${Math.abs(riskValue) < 1e-6 ? '0' : '-' + format(Math.abs(riskValue), cur.symbol)}</span></li>`;
        }
        // === Long Term Reward/Risk Value (Yearly S/R dengan logic yang sama) ===
        const yearlyLevels = window.calculator?.timeframes?.yearly?.levels;
        if (
            balanceBtc > 0 &&
            yearlyLevels &&
            typeof yearlyLevels.r1 === 'number' && !isNaN(yearlyLevels.r1) &&
            typeof yearlyLevels.s1 === 'number' && !isNaN(yearlyLevels.s1) &&
            typeof yearlyLevels.r2 === 'number' && !isNaN(yearlyLevels.r2) &&
            typeof yearlyLevels.s2 === 'number' && !isNaN(yearlyLevels.s2)
        ) {
            // Logic untuk yearly levels
            let yearlyNextTarget, yearlyNextSupport, yearlyNextTargetLevel, yearlyNextSupportLevel;
            const yearlyR1 = getPrice(yearlyLevels.r1, cur.symbol);
            const yearlyS1 = getPrice(yearlyLevels.s1, cur.symbol);
            const yearlyR2 = getPrice(yearlyLevels.r2, cur.symbol);
            const yearlyS2 = getPrice(yearlyLevels.s2, cur.symbol);
            
            if (currentPrice > yearlyR1) {
                // Current price sudah melebihi yearly R1, target seterusnya adalah yearly R2
                yearlyNextTarget = 'R2';
                yearlyNextTargetLevel = yearlyR2;
                yearlyNextSupport = 'R1';
                yearlyNextSupportLevel = yearlyR1;
            } else if (currentPrice < yearlyS1) {
                // Current price sudah di bawah yearly S1, support seterusnya adalah yearly S2
                yearlyNextTarget = 'R1';
                yearlyNextTargetLevel = yearlyR1;
                yearlyNextSupport = 'S2';
                yearlyNextSupportLevel = yearlyS2;
            } else {
                // Current price berada antara yearly S1 dan R1, target seterusnya adalah yearly R1
                yearlyNextTarget = 'R1';
                yearlyNextTargetLevel = yearlyR1;
                yearlyNextSupport = 'S1';
                yearlyNextSupportLevel = yearlyS1;
            }
            
            const longGain = (yearlyNextTargetLevel - currentPrice) * balanceBtc;
            const longRisk = (currentPrice - yearlyNextSupportLevel) * balanceBtc;
            srHtml += `<li><span class='sr-label'>Long Term Reward Value:</span> <span class='sr-value sr-gain'>+${format(Math.abs(longGain), cur.symbol)}</span></li>`;
            const longRiskValue = longRisk < 0 ? 0 : longRisk;
            srHtml += `<li><span class='sr-label'>Long Term Risk Value:</span> <span class='sr-value sr-risk'>${Math.abs(longRiskValue) < 1e-6 ? '0' : '-' + format(Math.abs(longRiskValue), cur.symbol)}</span></li>`;
        }
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

function calculateBTCMultiCurrency() {
    const btc = parseFloat(document.getElementById('btc-amount').value) || 0;
    const price = parseFloat(document.getElementById('btc-price').value) || 0;

    // Guna live rates jika ada, fallback jika tiada
    const myrRate = window.converterRates?.MYR || 4.25;
    const idrRate = window.converterRates?.IDR || 15800;
    const cnyRate = window.converterRates?.CNY || 7.2;

    const usd = btc * price;
    const myr = usd * myrRate;
    const idr = usd * idrRate;
    const cny = usd * cnyRate;

    document.getElementById('calc-usd').textContent = `$${usd.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById('calc-myr').textContent = `RM ${myr.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    document.getElementById('calc-idr').textContent = `Rp ${idr.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    document.getElementById('calc-cny').textContent = `¥${cny.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
}