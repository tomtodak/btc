# 🚀 BTC Support & Resistance Calculator

A real-time Bitcoin support and resistance calculator with multi-timeframe analysis (Daily, Weekly, Monthly) using volume-based data from Binance API.

## 📊 Features

### 🎯 Multi-Timeframe Analysis
- **Daily:** Yesterday's data for short-term trading (1-3 days)
- **Weekly:** 7 days ago data for medium-term trading (1-2 weeks)
- **Monthly:** 30 days ago data for long-term trading (1-3 months)

### 🔄 Real-Time Updates
- **Current BTC Price:** Updates every 10 seconds
- **Support & Resistance Levels:** Updates every 5 minutes
- **Data Source:** Binance API (free, no API key required)

### 📈 Volume-Based Calculations
- **High:** Price with highest buy volume in the period
- **Low:** Price with highest sell volume in the period
- **Close:** Current BTC price (same for all timeframes)

## 🧮 Formula Used

### Pivot Point Calculation
```
P = (High + Low + Close) / 3
```

### Support & Resistance Levels
```
R1 = (2 × P) - Low
S1 = (2 × P) - High
Range = R1 - S1

R4 = P + (Range × 3)
R3 = P + (Range × 2)
R2 = P + Range
S2 = P - Range
S3 = P - (Range × 2)
S4 = P - (Range × 3)
```

## 📅 Data Periods

### Daily Analysis
- **Period:** Yesterday only
- **Use Case:** Short-term trades (1-3 days)
- **Data:** Most bought/sold prices from yesterday

### Weekly Analysis
- **Period:** 7 days ago (1-7 days before today)
- **Use Case:** Medium-term trades (1-2 weeks)
- **Data:** Most bought/sold prices from 7 days ago

### Monthly Analysis
- **Period:** 30 days ago (1-30 days before today)
- **Use Case:** Long-term trades (1-3 months)
- **Data:** Most bought/sold prices from 30 days ago

## 🎨 UI Features

### Design
- **Glassmorphism Design:** Modern, beautiful interface
- **Responsive Layout:** Works on desktop and mobile
- **Tab System:** Easy switching between timeframes
- **Color Coding:**
  - 🔴 Resistance levels (R1-R4)
  - 🟡 Pivot point (P)
  - 🔵 Support levels (S1-S4)

### Components
- **Current Price Display:** Real-time BTC price
- **Level Cards:** All support/resistance levels
- **Data Source Info:** Period and calculation details
- **Comparison Table:** Side-by-side timeframe comparison
- **Status Updates:** Loading and error states

## 🚀 How to Use

### 1. Open the Application
- **GitHub Pages:** https://tomtodak.github.io/btc/
- **Local:** Download `index.html` and open in browser

### 2. Navigate Timeframes
- Click **Daily** tab for short-term analysis
- Click **Weekly** tab for medium-term analysis
- Click **Monthly** tab for long-term analysis

### 3. Trading Strategy
```
Example Scenario:
- Current Price: $43,250
- Daily S1: $42,466 (nearest support)
- Strategy: Buy around $42,466, target Daily R1
```

## 📊 API Data Sources

### Binance Public APIs (Free)
- **Current Price:** `https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT`
- **24hr Ticker:** `https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT`
- **Recent Trades:** `https://api.binance.com/api/v3/trades?symbol=BTCUSDT&limit=1000`
- **Historical Klines:** `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h`

### Data Processing
1. **Filter Trades:** By date range for each timeframe
2. **Volume Analysis:** Calculate buy/sell volume by price
3. **Find Extremes:** Highest buy volume (High) and highest sell volume (Low)
4. **Calculate Levels:** Using pivot point formula

## 🔧 Technical Details

### JavaScript Classes
- **MultiTimeframeBTCCalculator:** Main calculator class
- **Data Management:** Handles all timeframe data
- **Real-time Updates:** Automatic data refresh
- **Error Handling:** Graceful API error management

### Key Functions
```javascript
// Get timeframe data
async getTimeframeData(timeframe, days)

// Calculate support/resistance levels
calculateLevels(timeframe)

// Update display
updateTimeframeDisplay(timeframe)

// Real-time updates
startRealTimeUpdates()
```

## 📈 Trading Applications

### Daily Levels
- **Best For:** Day trading, scalping
- **Timeframe:** 1-3 days
- **Example:** Use Daily S1/R1 for intraday trades

### Weekly Levels
- **Best For:** Swing trading
- **Timeframe:** 1-2 weeks
- **Example:** Use Weekly levels for weekly position trades

### Monthly Levels
- **Best For:** Position trading, long-term holds
- **Timeframe:** 1-3 months
- **Example:** Use Monthly levels for major trend analysis

## 🎯 Key Advantages

### ✅ Volume-Based Analysis
- Uses actual trading volume data
- More accurate than simple high/low prices
- Reflects real market sentiment

### ✅ Multi-Timeframe
- Three different perspectives
- Suitable for different trading styles
- Comprehensive market analysis

### ✅ Real-Time Updates
- Live BTC price updates
- Automatic level recalculations
- No manual refresh needed

### ✅ Free & Open Source
- No API keys required
- Uses public Binance APIs
- Completely free to use

## 🔮 Future Enhancements

### Potential Additions
- **More Timeframes:** 4H, 1H, 15M intervals
- **Additional Indicators:** RSI, MACD, Moving Averages
- **Price Alerts:** Notifications when price hits levels
- **Historical Charts:** Visual price charts with levels
- **Export Data:** CSV/PDF reports
- **Mobile App:** Native mobile application

### Technical Improvements
- **WebSocket:** Real-time price streaming
- **Caching:** Better data caching for performance
- **Offline Mode:** Basic functionality without internet
- **Multiple Exchanges:** Support for other exchanges

## 📝 Project History

### Development Timeline
1. **Initial Concept:** Volume-based support/resistance calculation
2. **Formula Design:** Pivot point with volume data
3. **Multi-Timeframe:** Daily, Weekly, Monthly analysis
4. **UI Development:** Modern glassmorphism design
5. **API Integration:** Binance public APIs
6. **Real-time Updates:** Automatic data refresh
7. **GitHub Deployment:** Public repository and documentation

### Key Decisions
- **Data Source:** Binance API (free, reliable)
- **Timeframe Logic:** Historical periods (not rolling windows)
- **Close Price:** Current price for all timeframes
- **Volume Analysis:** Buy/sell volume by price level
- **UI Design:** Tab-based interface for easy navigation

## 🤝 Contributing

### How to Contribute
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Setup
```bash
git clone https://github.com/tomtodak/btc.git
cd btc
# Open index.html in browser
```

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- **Binance API:** For providing free market data
- **Trading Community:** For feedback and suggestions
- **Open Source:** For inspiration and best practices

---

**🚀 Happy Trading!** 

*Remember: This tool is for educational and informational purposes. Always do your own research and consider consulting with financial advisors before making trading decisions.* 