const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');

const app = express();

// 🛠️ සයිට් එකට රික්වෙස්ට් යවන ක්ලයන්ට් එක සෙට් කිරීම
const client = axios.create({
    baseURL: config.SITE_URL,
    timeout: 15000,
    headers: {
        'User-Agent': config.USER_AGENT,
        'Cookie': config.COOKIE,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    }
});

// 🔍 1. මූවී එක සර්ච් කරලා පළවෙනි පෝස්ට් එකේ URL එක ගන්නා නවීකරණය කළ කොටස
async function searchMovie(query) {
    try {
        const searchPath = `/?s=${encodeURIComponent(query)}`;
        const { data } = await client.get(searchPath);
        const $ = cheerio.load(data);
        
        let moviePageUrl = null;
        let title = null;

        // ක්‍රමය 1: සාමාන්‍ය සර්ච් බොක්ස් රිසල්ට් (div.result-item) චෙක් කිරීම
        const firstResult = $('div.result-item article').first();
        if (firstResult.length) {
            title = firstResult.find('div.title a').text().trim();
            moviePageUrl = firstResult.find('div.title a').attr('href');
        } 
        
        // ක්‍රමය 2: (Fallback) සයිට් එකේ ලේඅවුට් එක වෙනස් වුණොත් සෘජුවම <a> tags සෙවීම
        if (!moviePageUrl) {
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().toLowerCase();
                
                if (href && (href.includes('/?p=') || (href.includes('sinhalasub.lk/') && !href.includes('/category/') && !href.includes('/tag/') && text.includes(query.toLowerCase())))) {
                    moviePageUrl = href;
                    title = $(el).text().trim() || query;
                    return false; // ලින්ක් එක හමු වූ නිසා loop එක නවත්වයි
                }
            });
        }

        if (!moviePageUrl) return null;

        return { title, moviePageUrl };
    } catch (error) {
        console.error("🔍 Search Error Details:", error.message);
        return null;
    }
}

// 📥 2. මූවී පේජ් එක ඇතුළෙන් Pixeldrain Direct Link එක ඇදලා ගන්නා කොටස
async function scrapePixeldrain(pageUrl) {
    try {
        const { data } = await client.get(pageUrl);
        const $ = cheerio.load(data);
        
        let directDownloadLink = null;

        // පේජ් එකේ තියෙන ඔක්කොම <a> tags (ලින්ක්ස්) චෙක් කරනවා
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            
            if (href && href.includes('pixeldrain.com/u/')) {
                // ⚡ Pixeldrain View ලින්ක් එක කෙලින්ම Direct Download API ලින්ක් එකක් බවට හරවයි
                directDownloadLink = href.replace('/u/', '/api/file/');
                return false; // ලින්ක් එක හමු වූ නිසා loop එක නවත්වයි
            }
        });

        return directDownloadLink;
    } catch (error) {
        console.error("📥 Scraping Link Error:", error.message);
        return null;
    }
}

// 🌐 3. API Endpoint (මෙතනින් තමයි බොට් එක ඩේටා ගන්නේ)
app.get('/api/movie', async (req, res) => {
    const movieName = req.query.name;
    
    if (!movieName) {
        return res.status(400).json({ status: false, error: "කරුණාකර මූවී එකේ නම ඇතුළත් කරන්න. (?name=movie_name)" });
    }

    console.log(`🎬 Searching request received for: ${movieName}`);
    
    // පියවර 1: සර්ච් කිරීම
    const movieInfo = await searchMovie(movieName);
    if (!movieInfo) {
        return res.json({ status: false, message: "කණගාටුයි, එම චිත්‍රපටය Sinhalasub සයිට් එකෙන් හමු වූයේ නැත." });
    }

    // පියවර 2: Pixeldrain ලින්ක් එක සීරීම
    const downloadLink = await scrapePixeldrain(movieInfo.moviePageUrl);
    if (!downloadLink) {
        return res.json({ 
            status: false, 
            message: `"${movieInfo.title}" චිත්‍රපටය හමු විය, නමුත් එහි Pixeldrain Download ලින්ක් එකක් හමු වූයේ නැත.` 
        });
    }

    // පියවර 3: සාර්ථක ප්‍රතිඵලය JSON එකක් ලෙස බොට් එකට දීම
    res.json({
        status: true,
        title: movieInfo.title,
        downloadLink: downloadLink
    });
});

// සර්වර් එක පණ ගැන්වීම
app.listen(config.PORT, () => {
    console.log(`🚀 Sinhalasub Movie Scraper API is running on port ${config.PORT}`);
});
