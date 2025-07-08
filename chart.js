class BTCCandlestickChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.data = [];
        this.currentPrice = 0;
        this.interval = '1d'; // 1 day candles for yearly
        this.limit = 365; // last 365 days
        this.padding = 40;
        this.candleWidth = 8;
        this.candleSpacing = 2;
        this.yTicks = 6;
        this.levels = {};
        this.init();
    }

    init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.fetchAndDraw();
        setInterval(() => this.fetchAndDraw(), 10000); // update every 10s
        // Listen for tab switch to update S/R lines
        window.addEventListener('updateChartLevels', () => {
            this.levels = this.getCurrentLevels();
            this.draw();
        });
        // Also update S/R lines on tab click
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.levels = this.getCurrentLevels();
                this.draw();
            });
        });
    }

    resizeCanvas() {
        // Dapatkan saiz container
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth;
        const containerHeight = 600; // Fixed height untuk chart
        
        // Set canvas size berdasarkan container
        this.canvas.width = containerWidth;
        this.canvas.height = containerHeight;
        
        // Reset transform untuk memastikan lukisan betul
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    getCurrentLevels() {
        if (window.calculator && window.calculator.timeframes && window.calculator.currentTimeframe) {
            const tf = window.calculator.timeframes[window.calculator.currentTimeframe];
            return tf.levels || {};
        }
        return {};
    }

    async fetchAndDraw() {
        try {
            const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${this.interval}&limit=${this.limit}`;
            const res = await fetch(url);
            const klines = await res.json();
            this.data = klines.map(k => ({
                time: k[0],
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                volume: parseFloat(k[5])
            }));
            this.currentPrice = this.data[this.data.length-1]?.close || 0;
            this.levels = this.getCurrentLevels();
            this.draw();
            this.updatePriceDisplay();
        } catch (e) {
            this.clear();
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText('Error loading chart', 50, 50);
        }
    }

    draw() {
        this.clear();
        this.drawGrid();
        this.drawCandlesticks();
        this.drawYAxisLabels();
        this.drawXAxisLabels();
        this.drawSupportResistanceLines();
        this.drawCurrentPriceLine();
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawGrid() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        this.ctx.lineWidth = 1;
        for (let x = this.padding; x < width - this.padding; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.padding);
            this.ctx.lineTo(x, height - this.padding);
            this.ctx.stroke();
        }
        for (let y = this.padding; y < height - this.padding; y += 30) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding, y);
            this.ctx.lineTo(width - this.padding, y);
            this.ctx.stroke();
        }
    }

    drawCandlesticks() {
        if (!this.data.length) return;
        const chartWidth = this.canvas.width - 2 * this.padding;
        const chartHeight = this.canvas.height - 2 * this.padding;
        // Collect all S/R levels and current price
        const allLevels = [
            ...['s1','s2','s3','s4','r1','r2','r3','r4'].map(k => this.levels[k]).filter(v => v && v > 0),
            this.currentPrice,
            ...this.data.map(d => d.low),
            ...this.data.map(d => d.high)
        ];
        let minPrice = Math.min(...allLevels);
        let maxPrice = Math.max(...allLevels);
        let priceRange = maxPrice - minPrice;
        // Tambah minimum price range
        const minRange = this.currentPrice * 0.02;
        if (priceRange < minRange) {
            const center = (maxPrice + minPrice) / 2;
            minPrice = center - minRange / 2;
            maxPrice = center + minRange / 2;
            priceRange = maxPrice - minPrice;
        }
        minPrice -= priceRange * 0.05;
        maxPrice += priceRange * 0.05;
        const totalCandleWidth = this.candleWidth + this.candleSpacing;
        const candlesToShow = Math.min(this.data.length, Math.floor(chartWidth / totalCandleWidth));
        const startIndex = this.data.length - candlesToShow;
        for (let i = 0; i < candlesToShow; i++) {
            const candle = this.data[startIndex + i];
            const x = this.padding + (i * totalCandleWidth) + (this.candleWidth / 2);
            const openY = this.padding + chartHeight - ((candle.open - minPrice) / (maxPrice - minPrice) * chartHeight);
            const closeY = this.padding + chartHeight - ((candle.close - minPrice) / (maxPrice - minPrice) * chartHeight);
            const highY = this.padding + chartHeight - ((candle.high - minPrice) / (maxPrice - minPrice) * chartHeight);
            const lowY = this.padding + chartHeight - ((candle.low - minPrice) / (maxPrice - minPrice) * chartHeight);
            this.ctx.strokeStyle = candle.close >= candle.open ? '#4ecdc4' : '#ff6b6b';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(x, highY);
            this.ctx.lineTo(x, lowY);
            this.ctx.stroke();
            const bodyHeight = Math.max(1, Math.abs(closeY - openY));
            const bodyY = Math.min(openY, closeY);
            this.ctx.fillStyle = candle.close >= candle.open ? '#4ecdc4' : '#ff6b6b';
            this.ctx.fillRect(x - this.candleWidth/2, bodyY, this.candleWidth, bodyHeight);
        }
    }

    drawYAxisLabels() {
        if (!this.data.length) return;
        const chartHeight = this.canvas.height - 2 * this.padding;
        // Collect all S/R levels and current price
        const allLevels = [
            ...['s1','s2','s3','s4','r1','r2','r3','r4'].map(k => this.levels[k]).filter(v => v && v > 0),
            this.currentPrice,
            ...this.data.map(d => d.low),
            ...this.data.map(d => d.high)
        ];
        let minPrice = Math.min(...allLevels);
        let maxPrice = Math.max(...allLevels);
        let priceRange = maxPrice - minPrice;
        const minRange = this.currentPrice * 0.02;
        if (priceRange < minRange) {
            const center = (maxPrice + minPrice) / 2;
            minPrice = center - minRange / 2;
            maxPrice = center + minRange / 2;
            priceRange = maxPrice - minPrice;
        }
        minPrice -= priceRange * 0.05;
        maxPrice += priceRange * 0.05;
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px Proxima Nova, Arial, sans-serif';
        for (let i = 0; i <= this.yTicks; i++) {
            const price = maxPrice - (i * (maxPrice - minPrice) / this.yTicks);
            const y = this.padding + chartHeight - ((price - minPrice) / (maxPrice - minPrice) * chartHeight);
            const formattedPrice = this.formatChartPrice(price);
            this.ctx.fillText(formattedPrice, 2, y + 4);
        }
    }

    drawXAxisLabels() {
        if (!this.data.length) return;
        const chartWidth = this.canvas.width - 2 * this.padding;
        const chartHeight = this.canvas.height - 2 * this.padding;
        const totalCandleWidth = this.candleWidth + this.candleSpacing;
        const candlesToShow = Math.min(this.data.length, Math.floor(chartWidth / totalCandleWidth));
        const startIndex = this.data.length - candlesToShow;
        
        // Show dates at regular intervals (every 30 candles or so)
        const dateInterval = Math.max(1, Math.floor(candlesToShow / 8));
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '10px Proxima Nova, Arial, sans-serif';
        this.ctx.textAlign = 'center';
        
        for (let i = 0; i < candlesToShow; i += dateInterval) {
            const candle = this.data[startIndex + i];
            const x = this.padding + (i * totalCandleWidth) + (this.candleWidth / 2);
            const y = this.canvas.height - 5; // Position at bottom
            
            // Convert timestamp to date
            const date = new Date(candle.time);
            const dateStr = date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
            });
            
            this.ctx.fillText(dateStr, x, y);
        }
        
        // Reset text alignment
        this.ctx.textAlign = 'left';
    }

    drawSupportResistanceLines() {
        if (!this.data.length) return;
        if (!this.levels) return;
        const chartHeight = this.canvas.height - 2 * this.padding;
        // Collect all S/R levels and current price
        const allLevels = [
            ...['s1','s2','s3','s4','r1','r2','r3','r4'].map(k => this.levels[k]).filter(v => v && v > 0),
            this.currentPrice,
            ...this.data.map(d => d.low),
            ...this.data.map(d => d.high)
        ];
        let minPrice = Math.min(...allLevels);
        let maxPrice = Math.max(...allLevels);
        let priceRange = maxPrice - minPrice;
        const minRange = this.currentPrice * 0.02;
        if (priceRange < minRange) {
            const center = (maxPrice + minPrice) / 2;
            minPrice = center - minRange / 2;
            maxPrice = center + minRange / 2;
            priceRange = maxPrice - minPrice;
        }
        minPrice -= priceRange * 0.05;
        maxPrice += priceRange * 0.05;
        
        // Support levels (red #ff1744) - Format: SL1 $price, SL2 $price, etc.
        ['s1','s2','s3','s4'].forEach((key, idx) => {
            const val = this.levels[key];
            if (val && val > 0) {
                let y = this.padding + chartHeight - ((val - minPrice) / (maxPrice - minPrice) * chartHeight);
                this.ctx.strokeStyle = '#ff1744';
                this.ctx.lineWidth = 0.8;
                this.ctx.setLineDash([8,4]);
                this.ctx.beginPath();
                this.ctx.moveTo(this.padding, y);
                this.ctx.lineTo(this.canvas.width - this.padding, y);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
                this.ctx.fillStyle = '#ff1744';
                this.ctx.font = '12px Proxima Nova, Arial, sans-serif';
                const formattedPrice = this.formatChartPrice(val);
                const label = `SL${idx + 1} ${formattedPrice}`;
                this.ctx.fillText(label, this.canvas.width - this.padding - 100, y - 2);
            }
        });
        
        // Resistance levels (green #00e676) - Format: TR1 $price, TR2 $price, etc.
        ['r1','r2','r3','r4'].forEach((key, idx) => {
            const val = this.levels[key];
            if (val && val > 0) {
                let y = this.padding + chartHeight - ((val - minPrice) / (maxPrice - minPrice) * chartHeight);
                this.ctx.strokeStyle = '#00e676';
                this.ctx.lineWidth = 0.8;
                this.ctx.setLineDash([8,4]);
                this.ctx.beginPath();
                this.ctx.moveTo(this.padding, y);
                this.ctx.lineTo(this.canvas.width - this.padding, y);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
                this.ctx.fillStyle = '#00e676';
                this.ctx.font = '12px Proxima Nova, Arial, sans-serif';
                const formattedPrice = this.formatChartPrice(val);
                const label = `TR${idx + 1} ${formattedPrice}`;
                this.ctx.fillText(label, this.canvas.width - this.padding - 100, y - 2);
            }
        });
    }

    drawCurrentPriceLine() {
        if (!this.data.length) return;
        const chartHeight = this.canvas.height - 2 * this.padding;
        // Collect all S/R levels and current price
        const allLevels = [
            ...['s1','s2','s3','s4','r1','r2','r3','r4'].map(k => this.levels[k]).filter(v => v && v > 0),
            this.currentPrice,
            ...this.data.map(d => d.low),
            ...this.data.map(d => d.high)
        ];
        let minPrice = Math.min(...allLevels);
        let maxPrice = Math.max(...allLevels);
        let priceRange = maxPrice - minPrice;
        const minRange = this.currentPrice * 0.02;
        if (priceRange < minRange) {
            const center = (maxPrice + minPrice) / 2;
            minPrice = center - minRange / 2;
            maxPrice = center + minRange / 2;
            priceRange = maxPrice - minPrice;
        }
        minPrice -= priceRange * 0.05;
        maxPrice += priceRange * 0.05;
        const y = this.padding + chartHeight - ((this.currentPrice - minPrice) / (maxPrice - minPrice) * chartHeight);
        this.ctx.strokeStyle = '#feca57';
        this.ctx.lineWidth = 0.8;
        this.ctx.beginPath();
        this.ctx.moveTo(this.padding, y);
        this.ctx.lineTo(this.canvas.width - this.padding, y);
        this.ctx.stroke();
        this.ctx.fillStyle = '#feca57';
        this.ctx.font = '14px Proxima Nova, Arial, sans-serif';
        const formattedPrice = this.formatChartPrice(this.currentPrice);
        this.ctx.fillText(formattedPrice, this.canvas.width - this.padding - 100, y - 8);
    }

    formatChartPrice(price) {
        // Use the same currency system as the main app
        if (typeof window !== 'undefined' && window.currentCurrency && window.currencyRates) {
            const currency = window.currentCurrency;
            const rates = window.currencyRates;
            
            if (currency === 'USD') {
                return `$${price.toLocaleString(undefined, {maximumFractionDigits:0})}`;
            } else if (currency === 'MYR') {
                const myrPrice = price * rates.MYR;
                return `RM ${myrPrice.toLocaleString(undefined, {maximumFractionDigits:0})}`;
            }
        }
        // Fallback to USD
        return `$${price.toLocaleString(undefined, {maximumFractionDigits:0})}`;
    }

    updatePriceDisplay() {
        const priceElement = document.getElementById('currentPrice');
        if (priceElement) {
            const formattedPrice = this.formatChartPrice(this.currentPrice);
            priceElement.innerHTML = `<span style="color:#feca57;font-size:1.2em;font-weight:bold;">${formattedPrice}</span>`;
        }
    }

    // Add new function for quick S/R update only
    updateSRLinesOnly() {
        if (!this.data.length) return;
        
        // Clear only the area where S/R lines and labels are drawn
        const chartHeight = this.canvas.height - 2 * this.padding;
        
        // Clear area for S/R lines (horizontal lines across chart)
        this.ctx.clearRect(this.padding, this.padding, this.canvas.width - 2 * this.padding, chartHeight);
        
        // Clear area for S/R labels (right side)
        this.ctx.clearRect(this.canvas.width - this.padding - 100, this.padding, 100, chartHeight);
        
        // Clear area for current price label
        this.ctx.clearRect(this.canvas.width - this.padding - 150, this.padding, 150, chartHeight);
        
        // Now draw only S/R lines and current price line (no candlesticks redraw)
        this.drawSupportResistanceLines();
        this.drawCurrentPriceLine();
    }
}

let btcChart = null;
document.addEventListener('DOMContentLoaded', () => {
    btcChart = new BTCCandlestickChart('btcChart');
}); 