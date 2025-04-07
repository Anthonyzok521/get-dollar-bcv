const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const momentTZ = require('moment-timezone');

const app = express();
const PORT = process.env.PORT || 3100;

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
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Función para obtener la tasa del BCV
async function obtenerTasaDolarBCV() {
  const url = 'https://www.bcv.org.ve/';
  
  try {
    const response = await axios.get(url, {
      httpsAgent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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

    return {
      tasa: tasa,
      fecha: dateFormateWithTZ(new Date()),
      moneda: 'USD',
      unidad: 'VES',
      fuente: 'BCV'
    };
    
  } catch (error) {
    throw new Error(`Error al obtener tasa BCV: ${error.message}`);
  }
}

// Endpoint principal
app.get('/api/tasa', async (req, res) => {
  try {
    const data = await obtenerTasaDolarBCV();
    res.json({
      success: true,
      data: data
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