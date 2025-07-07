class BTCCandlestickChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.data = [];
        this.supportLevels = [];
        this.resistanceLevels = [];
        this.currentPrice = 0;
        this.timeframe = 'daily';
        
        // Chart dimensions
        this.padding = 40;
        this.candleWidth = 8;
        this.candleSpacing = 4;
        
        this.init();
    }
    
    init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = 300;
    }
    
    setData(candlestickData, supportLevels, resistanceLevels, currentPrice, timeframe) {
        this.data = candlestickData || [];
        this.supportLevels = supportLevels || [];
        this.resistanceLevels = resistanceLevels || [];
        this.currentPrice = currentPrice || 0;
        this.timeframe = timeframe || 'daily';
        this.draw();
    }
    
    draw() {
        this.clear();
        this.drawGrid();
        this.drawCandlesticks();
        this.drawSupportResistanceLines();
        this.drawCurrentPriceLine();
        this.drawLegend();
    }
    
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    drawGrid() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        // Vertical grid lines
        for (let x = this.padding; x < width - this.padding; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.padding);
            this.ctx.lineTo(x, height - this.padding);
            this.ctx.stroke();
        }
        
        // Horizontal grid lines
        for (let y = this.padding; y < height - this.padding; y += 30) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding, y);
            this.ctx.lineTo(width - this.padding, y);
            this.ctx.stroke();
        }
    }
    
    drawCandlesticks() {
        if (this.data.length === 0) return;
        
        const chartWidth = this.canvas.width - (2 * this.padding);
        const chartHeight = this.canvas.height - (2 * this.padding);
        
        // Find price range
        let minPrice = Math.min(...this.data.map(d => d.low));
        let maxPrice = Math.max(...this.data.map(d => d.high));
        
        // Add padding to price range
        const priceRange = maxPrice - minPrice;
        minPrice -= priceRange * 0.1;
        maxPrice += priceRange * 0.1;
        
        const totalCandleWidth = this.candleWidth + this.candleSpacing;
        const availableWidth = chartWidth;
        const candlesToShow = Math.min(this.data.length, Math.floor(availableWidth / totalCandleWidth));
        
        // Start from the right (most recent data)
        const startIndex = Math.max(0, this.data.length - candlesToShow);
        
        for (let i = 0; i < candlesToShow; i++) {
            const dataIndex = startIndex + i;
            const candle = this.data[dataIndex];
            
            // Calculate x position
            const x = this.padding + (i * totalCandleWidth) + (this.candleWidth / 2);
            
            // Calculate y positions
            const openY = this.padding + chartHeight - ((candle.open - minPrice) / (maxPrice - minPrice) * chartHeight);
            const closeY = this.padding + chartHeight - ((candle.close - minPrice) / (maxPrice - minPrice) * chartHeight);
            const highY = this.padding + chartHeight - ((candle.high - minPrice) / (maxPrice - minPrice) * chartHeight);
            const lowY = this.padding + chartHeight - ((candle.low - minPrice) / (maxPrice - minPrice) * chartHeight);
            
            // Draw wick
            this.ctx.strokeStyle = candle.close >= candle.open ? '#4ecdc4' : '#ff6b6b';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(x, highY);
            this.ctx.lineTo(x, lowY);
            this.ctx.stroke();
            
            // Draw body
            const bodyHeight = Math.max(1, Math.abs(closeY - openY));
            const bodyY = Math.min(openY, closeY);
            
            this.ctx.fillStyle = candle.close >= candle.open ? '#4ecdc4' : '#ff6b6b';
            this.ctx.fillRect(x - this.candleWidth/2, bodyY, this.candleWidth, bodyHeight);
        }
    }
    
    drawSupportResistanceLines() {
        const chartHeight = this.canvas.height - (2 * this.padding);
        
        // Find price range for scaling
        let minPrice = this.currentPrice * 0.9;
        let maxPrice = this.currentPrice * 1.1;
        
        if (this.data.length > 0) {
            minPrice = Math.min(minPrice, Math.min(...this.data.map(d => d.low)));
            maxPrice = Math.max(maxPrice, Math.max(...this.data.map(d => d.high)));
        }
        
        // Draw support levels
        this.supportLevels.forEach((level, index) => {
            const y = this.padding + chartHeight - ((level - minPrice) / (maxPrice - minPrice) * chartHeight);
            
            this.ctx.strokeStyle = '#4ecdc4';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding, y);
            this.ctx.lineTo(this.canvas.width - this.padding, y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            // Draw label
            this.ctx.fillStyle = '#4ecdc4';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`S${index + 1}: $${level.toFixed(2)}`, this.canvas.width - this.padding - 100, y - 5);
        });
        
        // Draw resistance levels
        this.resistanceLevels.forEach((level, index) => {
            const y = this.padding + chartHeight - ((level - minPrice) / (maxPrice - minPrice) * chartHeight);
            
            this.ctx.strokeStyle = '#ff6b6b';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(this.padding, y);
            this.ctx.lineTo(this.canvas.width - this.padding, y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            // Draw label
            this.ctx.fillStyle = '#ff6b6b';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`R${index + 1}: $${level.toFixed(2)}`, this.canvas.width - this.padding - 100, y - 5);
        });
    }
    
    drawCurrentPriceLine() {
        if (this.currentPrice === 0) return;
        
        const chartHeight = this.canvas.height - (2 * this.padding);
        let minPrice = this.currentPrice * 0.9;
        let maxPrice = this.currentPrice * 1.1;
        
        if (this.data.length > 0) {
            minPrice = Math.min(minPrice, Math.min(...this.data.map(d => d.low)));
            maxPrice = Math.max(maxPrice, Math.max(...this.data.map(d => d.high)));
        }
        
        const y = this.padding + chartHeight - ((this.currentPrice - minPrice) / (maxPrice - minPrice) * chartHeight);
        
        this.ctx.strokeStyle = '#feca57';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(this.padding, y);
        this.ctx.lineTo(this.canvas.width - this.padding, y);
        this.ctx.stroke();
        
        // Draw label
        this.ctx.fillStyle = '#feca57';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText(`Current: $${this.currentPrice.toFixed(2)}`, this.canvas.width - this.padding - 120, y - 10);
    }
    
    drawLegend() {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.font = '12px Arial';
        this.ctx.fillText(`Timeframe: ${this.timeframe.toUpperCase()}`, 10, 20);
        this.ctx.fillText(`Support Levels: ${this.supportLevels.length}`, 10, 35);
        this.ctx.fillText(`Resistance Levels: ${this.resistanceLevels.length}`, 10, 50);
    }
    
    // Generate sample candlestick data from trades
    generateCandlestickData(trades, timeframe) {
        if (!trades || trades.length === 0) return [];
        
        // Group trades by hour for candlestick data
        const hourlyData = {};
        
        trades.forEach(trade => {
            const tradeTime = new Date(trade.time);
            const hourKey = new Date(tradeTime.getFullYear(), tradeTime.getMonth(), tradeTime.getDate(), tradeTime.getHours()).getTime();
            const price = parseFloat(trade.price);
            
            if (!hourlyData[hourKey]) {
                hourlyData[hourKey] = {
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    volume: parseFloat(trade.qty)
                };
            } else {
                hourlyData[hourKey].high = Math.max(hourlyData[hourKey].high, price);
                hourlyData[hourKey].low = Math.min(hourlyData[hourKey].low, price);
                hourlyData[hourKey].close = price;
                hourlyData[hourKey].volume += parseFloat(trade.qty);
            }
        });
        
        // Convert to array and sort by time
        return Object.keys(hourlyData)
            .map(key => ({
                time: parseInt(key),
                ...hourlyData[key]
            }))
            .sort((a, b) => a.time - b.time);
    }
}

// Global chart instance
let btcChart = null;

// Initialize chart when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    btcChart = new BTCCandlestickChart('btcChart');
}); 