const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const momentTZ = require('moment-timezone');
const connectDB = require('./db');
const DollarRate = require('./dollarRate');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3100;

// Conectar a MongoDB
connectDB();

// Configuración para ignorar errores de certificado SSL (solo desarrollo)
const agent = new https.Agent({  
  rejectUnauthorized: false
});

const dateFormateWithTZ = (date) => {
  try{
      const dateFormatTz = momentTZ.tz(date, 'YYYY-MM-DD HH:mm:ss', 'America/Caracas').format('DD-MM-YYYY hh:mm A');
      if(dateFormatTz.includes('Invalid date')){
          throw new Error(null);
      }
      return dateFormatTz;
  }catch(e){
      return null;
  }
}

// Middleware para permitir CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Función para obtener la tasa del BCV
async function obtenerTasaDolarBCV() {
  const today = momentTZ.tz('America/Caracas').day();

  // Si es Sábado (6) o Domingo (0)
  if (today === 5 || today === 6 || today === 0) {
    const lastRate = await DollarRate.findOne().sort({ fecha: -1 });
    if (lastRate) {
      return {
        tasa: lastRate.tasa,
        fecha: lastRate.fecha,
        moneda: 'USD',
        unidad: 'VES',
        fuente: 'BCV (Tasa de Viernes)'
      };
    } else {
      throw new Error('No hay tasas registradas para mostrar durante el fin de semana.');
    }
  }

  const url = 'https://www.bcv.org.ve/';
  
  try {
    const response = await axios.get(url, {
      httpsAgent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 5000
    });

    const $ = cheerio.load(response.data);
    const tasaText = $('#dolar strong').text().trim();
    
    if (!tasaText) {
      throw new Error('Elemento con la tasa no encontrado');
    }

    const tasaLimpia = tasaText
      .replace(/\./g, '')
      .replace(',', '.');

    const tasa = parseFloat(tasaLimpia);
    
    if (isNaN(tasa)) {
      throw new Error(`Valor no numérico: ${tasaText}`);
    }

    const newRate = {
      tasa: tasa,
      fecha: dateFormateWithTZ(new Date()),
      moneda: 'USD',
      unidad: 'VES',
      fuente: 'BCV'
    };

    // Guardar o actualizar en la base de datos
    const updatedRate = await DollarRate.findOneAndUpdate(
      { fuente: 'BCV' }, // Usamos la fuente como un identificador único
      newRate,
      { new: true, upsert: true } // new: true devuelve el documento actualizado, upsert: true crea el documento si no existe
    );

    return updatedRate;
    
  } catch (error) {
    throw new Error(`Error al obtener tasa BCV: ${error.message}`);
  }
}

// Función para obtener la tasa de USDT/VES del mercado P2P de Binance
async function obtenerTasaUSDTVES() {
  const url = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

  try {
    const response = await axios.post(url, {
      proMerchantAds: false,
      page: 1,
      rows: 5,
      payTypes: [],
      countries: [],
      publisherType: null,
      asset: 'USDT',
      fiat: 'VES',
      tradeType: 'SELL',
      classifies: ['mass', 'profession']
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Connection': 'keep-alive',
        'Origin': 'https://p2p.binance.com',
        'Referer': 'https://p2p.binance.com/'
      },
      timeout: 5000
    });

    const ads = response.data.data;

    if (!ads || ads.length === 0) {
      throw new Error('No se encontraron anuncios P2P');
    }

    // Para tradeType SELL, los anuncios vienen ordenados por mejor precio
    // (el menor precio al que un vendedor ofrece USDT)
    const mejorAnuncio = ads[0];
    const tasa = parseFloat(mejorAnuncio.adv.price);

    if (isNaN(tasa)) {
      throw new Error(`Valor no numérico: ${mejorAnuncio.adv.price}`);
    }

    return {
      tasa: tasa,
      fecha: dateFormateWithTZ(new Date()),
      fuente: 'BINANCE'
    };

  } catch (error) {
    throw new Error(`Error al obtener tasa USDT/VES Binance: ${error.message}`);
  }
}

async function obtenerTasaCuracao() {
  const url = 'https://www.mcb-bank.com/personal/support-services/currency-exchange-rates';

  try {
    const response = await axios.get(url, {
      httpsAgent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);

    let tasaText = null;
    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 7) {
        const currencyCode = $(cells[2]).text().trim().toUpperCase();
        if (currencyCode === 'USD') {
          tasaText = $(cells[6]).text().trim(); // Selling rate
          return false;
        }
      }
    });

    if (!tasaText) {
      throw new Error('No se encontró la tasa USD/XCG en la tabla');
    }

    const tasa = parseFloat(tasaText.replace(',', '.'));

    if (isNaN(tasa)) {
      throw new Error(`Valor no numérico: ${tasaText}`);
    }

    return {
      tasa: tasa,
      fecha: dateFormateWithTZ(new Date()),
      moneda: 'USD',
      unidad: 'XCG',
      fuente: 'MCB'
    };
  } catch (error) {
    throw new Error(`Error al obtener tasa USD/XCG MCB: ${error.message}`);
  }
}

// Endpoint para obtener la tasa de cambion en florin a USD
app.get('/api/curacao', async (req, res) => {
  try {
    const data = await obtenerTasaCuracao();
    res.json({
      success: true,
      data: data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint principal
app.get('/api/tasa', async (req, res) => {
  try {
    const data = await obtenerTasaDolarBCV();

    let usdtVes = null;
    try {
      usdtVes = await obtenerTasaUSDTVES();
    } catch (error) {
      usdtVes = { error: error.message };
    }

    res.json({
      success: true,
      data: data,
      'usdt-ves': usdtVes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// Endpoint de prueba
app.get('/', (req, res) => {
  res.send('API de Tasa del Dólar BCV - Use /api/tasa');
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

module.exports = app;
