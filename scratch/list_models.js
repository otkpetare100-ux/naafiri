async function listModels() {
    const fetch = (await import('node-fetch')).default;
    require('dotenv').config();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ Falta GEMINI_API_KEY en el archivo .env');
        return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error('❌ Error de la API:', data.error.message);
            return;
        }

        console.log('✅ Modelos disponibles para tu clave:');
        if (data.models) {
            data.models.forEach(m => {
                if (m.supportedGenerationMethods.includes('generateContent')) {
                    console.log(`- ${m.name}`);
                }
            });
        } else {
            console.log('No se encontraron modelos.');
        }
    } catch (e) {
        console.error('❌ Error al conectar con Google:', e.message);
    }
}

listModels();
