const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

let browserInstance;

async function getBrowser() {
    if (!browserInstance || !browserInstance.isConnected()) {
        browserInstance = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });
    }
    return browserInstance;
}

// 🔍 1. සයිට් එක Search කරලා මූවී එකේ URL එක ගන්න එක
async function searchMovie(query) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        const searchUrl = `https://sinhalasub.lk/?s=${encodeURIComponent(query)}`;
        console.log(`🔍 Searching: ${searchUrl}`);
        
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const result = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            let movieLink = null;
            let movieTitle = null;
            
            for (let i = 0; i < links.length; i++) {
                const a = links[i];
                const href = a.href || '';
                
                // අනවශ්‍ය ලින්ක්ස් බැහැර කිරීම
                const isUnwanted = href.includes('/category/') || href.includes('/tag/') || href.includes('/page/') || href.includes('/?s=') || href.includes('/language/') || href === 'https://sinhalasub.lk/' || href === 'https://sinhalasub.lk';
                
                if (href.includes('sinhalasub.lk/') && !isUnwanted) {
                    movieLink = href;
                    movieTitle = (a.innerText || '').trim();
                    break; // පළමු හරියන ලින්ක් එක ගත් පසු නවතිනවා
                }
            }
            
            return { movieLink, movieTitle };
        });

        if (!result.movieLink) return null;

        return { 
            title: result.movieTitle || 'Unknown Movie', 
            moviePageUrl: result.movieLink 
        };
    } catch (error) {
        console.error("Search Error:", error.message);
        return null;
    } finally {
        await page.close();
    }
}

// 📥 2. මූවී පේජ් එකට ගිහින් Direct CDN Links ගන්න එක (Debug Mode)
async function scrapeDownloadLinks(pageUrl) {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log(`📥 Visiting Movie Page: ${pageUrl}`);
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // DEBUG: පේජ් එකේ තියෙන හැම ලින්ක් එකක්ම අරගෙන Console එකට ප්‍රින්ට් කරමු
        const allLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            return links.map(a => ({
                text: (a.innerText || '').trim().substring(0, 50),
                href: a.href || ''
            }));
        });

        console.log(`\n================ DEBUG: LINKS ON PAGE ================`);
        allLinks.forEach((link, i) => {
            if(link.href && link.href !== '#' && !link.href.startsWith('javascript')) {
                console.log(`${i + 1}. Text: "${link.text}" | URL: ${link.href}`);
            }
        });
        console.log(`======================================================\n`);

        // දැන් අපිට ඕනේ ඒ ලින්ක්ස් වලින් Direct Download එක හොයන්න
        const downloadLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const results = [];
            
            links.forEach(a => {
                const href = a.href || '';
                const text = a.innerText || '';
                
                if (href.includes('cdn.sinhalasub') || href.includes('.mp4') || href.includes('pixeldrain.com')) {
                    
                    let quality = 'Unknown';
                    if (text.includes('1080') || text.toLowerCase().includes('fhd')) quality = 'FHD 1080p';
                    else if (text.includes('720') || text.toLowerCase().includes('hd')) quality = 'HD 720p';
                    else if (text.includes('480') || text.toLowerCase().includes('sd')) quality = 'SD 480p';
                    
                    if (quality === 'Unknown') {
                        if (href.includes('1080')) quality = 'FHD 1080p';
                        else if (href.includes('720')) quality = 'HD 720p';
                        else if (href.includes('480')) quality = 'SD 480p';
                    }

                    results.push({
                        quality: quality,
                        download_url: href
                    });
                }
            });

            const uniqueResults = [];
            const seenUrls = new Set();
            results.forEach(item => {
                if (!seenUrls.has(item.download_url)) {
                    seenUrls.add(item.download_url);
                    uniqueResults.push(item);
                }
            });

            return uniqueResults;
        });

        return downloadLinks;
    } catch (error) {
        console.error("Scraping Error:", error.message);
        return null;
    } finally {
        await page.close();
    }
}

// 🌐 3. API Endpoint එක
app.get('/api/movie', async (req, res) => {
    const movieName = req.query.name;
    
    if (!movieName) {
        return res.status(400).json({ status: false, error: "කරුණාකර මූවී එකේ නම ඇතුළත් කරන්න. (?name=movie_name)" });
    }

    console.log(`🎬 Request received for: ${movieName}`);
    
    const movieInfo = await searchMovie(movieName);
    if (!movieInfo) {
        return res.json({ status: false, message: "කණගාටුයි, එම චිත්‍රපටය හමු වූයේ නැත." });
    }

    const downloadLinks = await scrapeDownloadLinks(movieInfo.moviePageUrl);
    if (!downloadLinks || downloadLinks.length === 0) {
        return res.json({ 
            status: false, 
            message: `"${movieInfo.title}" චිත්‍රපටය හමු විය, නමුත් Direct Download ලින්ක්ස් හමු වූයේ නැත.` 
        });
    }

    res.json({
        status: true,
        owner: "@heshan",
        title: movieInfo.title,
        result: downloadLinks
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Sinhalasub Scraper API running on http://localhost:${PORT}`);
});
