const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

// Configuración para ignorar errores de certificado SSL (solo desarrollo)
const agent = new https.Agent({
  rejectUnauthorized: false
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
      fecha: new Date().toISOString(),
      moneda: 'USD',
      unidad: 'VES',
      fuente: 'BCV'
    };
    
  } catch (error) {
    throw new Error(`Error al obtener tasa BCV: ${error.message}`);
  }
}

module.exports = async (req, res) => {
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
};