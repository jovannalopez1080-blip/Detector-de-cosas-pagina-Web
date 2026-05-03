let model;
let videoListo = false;
let prediccionesRecientes = []; // Almacenar últimas predicciones para estabilidad
const UMBRAL_CONFIANZA = 50; // Solo mostrar si es más del 50% de confianza
const PREDICCIONES_HISTORIAL = 5; // Promediar últimas 5 detecciones

async function iniciar() {
  try {
    console.log("Cargando modelo CocoSsd...");
    document.getElementById("estado-camara").innerText = "⏳ Cargando...";
    document.getElementById("resultado").innerHTML = "⏳ Cargando modelo... (esto puede tomar 10-20 segundos)";
    
    // Cargar CocoSsd (mejor precisión que MobileNet)
    model = await cocoSsd.load();
    console.log("Modelo CocoSsd cargado ✓");
    document.getElementById("resultado").innerHTML = "✅ Modelo cargado. Solicitando acceso a cámara...";

    const video = document.getElementById("video");
    
    try {
      // Intentar obtener la cámara con configuración mejorada
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: false
      });
      
      video.srcObject = stream;
      
      // Esperar a que el video esté listo y comenzarlo
      try {
        await video.play();
      } catch (playError) {
        console.warn('video.play() falló:', playError);
      }

      await new Promise((resolve) => {
        if (video.readyState >= 3) return resolve();
        video.oncanplay = () => resolve();
        setTimeout(resolve, 3000); // fallback
      });

      console.log("Video listo, dimensiones:", video.videoWidth, "x", video.videoHeight);
      videoListo = true;

      // Cambiar indicador a activo
      document.getElementById("indicador").classList.remove("indicador-inactivo");
      document.getElementById("indicador").classList.add("indicador-activo");
      document.getElementById("indicador").innerText = "✅ Cámara activa";
      document.getElementById("estado-camara").innerText = "🟢 ACTIVA";
      document.getElementById("resultado").innerHTML = "🎯 Cámara lista - apunta a un objeto";

      console.log("Cámara activada ✓");
      setInterval(predecir, 1500);
      
    } catch (cameraError) {
      console.error("Error de cámara:", cameraError);
      
      let mensajeError = "❌ Error de cámara: ";
      if (cameraError.name === "NotAllowedError") {
        mensajeError += "Permiso denegado. Ve a configuración del navegador y permite cámara.";
      } else if (cameraError.name === "NotFoundError") {
        mensajeError += "No se encontró cámara. Verifica que tu dispositivo tiene cámara.";
      } else if (cameraError.name === "NotReadableError") {
        mensajeError += "La cámara está siendo usada por otra aplicación.";
      } else {
        mensajeError += cameraError.message;
      }
      
      document.getElementById("resultado").innerHTML = `
        <div style="background: rgba(255, 100, 100, 0.2); padding: 15px; border-radius: 10px; margin-top: 10px; color: #d32f2f;">
          <strong>${mensajeError}</strong><br>
          <small>Intenta: Recarga la página, cierra otras apps que usen cámara, o reinicia el navegador</small>
        </div>
      `;
      document.getElementById("estado-camara").innerText = "🔴 ERROR CÁMARA";
    }
    
  } catch (error) {
    console.error("Error general:", error);
    document.getElementById("resultado").innerHTML = `
      <div style="background: rgba(255, 100, 100, 0.2); padding: 15px; border-radius: 10px; margin-top: 10px; color: #d32f2f;">
        <strong>❌ Error: ${error.message}</strong><br>
        <small>Abre la consola (F12) para más detalles</small>
      </div>
    `;
    document.getElementById("estado-camara").innerText = "🔴 ERROR";
  }
}

function clasificarTipo(objeto) {
  objeto = objeto.toLowerCase();
  
  // Diccionario de traducciones para CocoSsd (90 categorías)
  const traducciones = {
    // Personas
    "person": "Persona",
    
    // Vehículos
    "bicycle": "Bicicleta", "car": "Coche", "motorcycle": "Motocicleta", "airplane": "Avión",
    "bus": "Autobús", "train": "Tren", "truck": "Camión", "boat": "Bote",
    
    // ANIMALES
    "cat": "Gato", "dog": "Perro", "horse": "Caballo", "sheep": "Oveja", "cow": "Vaca",
    "elephant": "Elefante", "bear": "Oso", "zebra": "Cebra", "giraffe": "Jirafa",
    "backpack": "Mochila", "umbrella": "Paraguas", "handbag": "Bolso",
    "tie": "Corbata", "suitcase": "Maleta", "frisbee": "Frisbee", "skis": "Esquís",
    "snowboard": "Tabla de snow", "sports ball": "Balón deportivo", "kite": "Cometa",
    "baseball bat": "Bate de béisbol", "baseball glove": "Guante de béisbol",
    "skateboard": "Patineta", "surfboard": "Tabla de surf", "tennis racket": "Raqueta de tenis",
    
    // COCINA/COMIDA
    "bottle": "Botella", "wine glass": "Copa de vino", "cup": "Taza", "fork": "Tenedor",
    "knife": "Cuchillo", "spoon": "Cuchara", "bowl": "Tazón", "banana": "Plátano",
    "apple": "Manzana", "sandwich": "Sándwich", "orange": "Naranja", "broccoli": "Brócoli",
    "carrot": "Zanahoria", "hot dog": "Hot dog", "pizza": "Pizza", "donut": "Donut",
    "cake": "Pastel", "chair": "Silla", "couch": "Sofá", "potted plant": "Maceta",
    "bed": "Cama", "dining table": "Mesa de comedor", "toilet": "Inodoro",
    
    // ELECTRODOMÉSTICOS
    "tv": "Televisor", "laptop": "Laptop", "mouse": "Ratón", "remote": "Control remoto",
    "keyboard": "Teclado", "microwave": "Microondas", "oven": "Horno", "toaster": "Tostadora",
    "sink": "Lavamanos", "refrigerator": "Refrigerador", "book": "Libro", "clock": "Reloj",
    
    // DEPORTES Y OBJETOS
    "vase": "Jarrón", "scissors": "Tijeras", "teddy bear": "Oso de peluche", "hair drier": "Secador de pelo",
    "toothbrush": "Cepillo de dientes", "hair brush": "Cepillo de cabello",
    
    // BEBIDAS/VIDRIO
    "glass": "Vaso", "water bottle": "Botella de agua",
    
    // PAPEL
    "newspaper": "Periódico",
    
    // GENERAL
    "object": "Objeto", "item": "Artículo", "thing": "Cosa"
  };
  
  let tipo = "❓ SIN CLASIFICAR";
  let categoria = "Sin categoría";
  
  // Palabras clave para categorías mejoradas
  const organico = ["apple", "orange", "banana", "broccoli", "carrot", "pizza", "hot dog", 
    "sandwich", "donut", "cake", "bird"];
  
  const desecho = ["garbage", "trash", "waste", "broken", "damaged"];
  
  // Buscar en traducciones
  for (let palabra in traducciones) {
    if (objeto.includes(palabra)) {
      // Determinar la categoría
      if (organico.some(o => objeto.includes(o))) {
        tipo = "🟤 ORGÁNICO";
        categoria = "Orgánico";
      } else if (desecho.some(d => objeto.includes(d))) {
        tipo = "🗑️ DESECHO";
        categoria = "Desecho";
      } else if (["bottle", "glass", "cup", "wine glass", "fork", "knife", "spoon", "bowl"].some(o => objeto.includes(o))) {
        tipo = "🏭 INORGÁNICO";
        categoria = "Inorgánico";
      } else {
        tipo = "🏭 INORGÁNICO";
        categoria = "Inorgánico";
      }
      
      return { 
        tipo: tipo,
        categoria: categoria,
        detalle: traducciones[palabra]
      };
    }
  }
  
  // Si no encontró traducción exacta, intenta clasificar por características
  if (organico.some(o => objeto.includes(o))) {
    tipo = "🟤 ORGÁNICO";
    categoria = "Orgánico";
  } else if (desecho.some(d => objeto.includes(d))) {
    tipo = "🗑️ DESECHO";
    categoria = "Desecho";
  } else {
    tipo = "🏭 INORGÁNICO";
    categoria = "Inorgánico";
  }
  
  // Capitalizar la primera letra del objeto detectado
  let nombreObjeto = objeto.charAt(0).toUpperCase() + objeto.slice(1);
  
  return { 
    tipo: tipo,
    categoria: categoria,
    detalle: traducciones[objeto] || nombreObjeto
  };
}

async function predecir() {
  if (!videoListo || !model) return;

  try {
    const video = document.getElementById("video");
    
    // CocoSsd detecta múltiples objetos con bounding boxes
    // use the public CocoSsd API
    const predicciones = await model.detect(video);

    if (!predicciones || predicciones.length === 0) {
      document.getElementById("resultado").innerText = "No se detectó nada";
      return;
    }

    // Obtener la predicción con mayor confianza (score)
    const mejorPrediccion = predicciones[0];
    const objeto = mejorPrediccion.class;
    const confianza = (mejorPrediccion.score * 100).toFixed(1);
    
    // Si la confianza es baja, advertir al usuario
    if (confianza < UMBRAL_CONFIANZA) {
      document.getElementById("resultado").innerHTML = `
        <div style="line-height: 2; background: rgba(255, 200, 0, 0.2); padding: 15px; border-radius: 10px; margin-top: 10px;">
          <strong style="font-size: 18px; color: #ff9800;">⚠️ INCERTIDUMBRE ALTA</strong><br>
          <span style="font-size: 14px;">Confianza: ${confianza}% - Muy baja</span><br>
          <small style="opacity: 0.7;">Intenta mejorar iluminación o enfoque</small>
        </div>
      `;
      return;
    }
    
    const clasificacion = clasificarTipo(objeto);
    
    // Agregar a historial
    prediccionesRecientes.push({
      objeto: objeto,
      clasificacion: clasificacion,
      confianza: confianza
    });
    
    // Mantener solo las últimas N predicciones
    if (prediccionesRecientes.length > PREDICCIONES_HISTORIAL) {
      prediccionesRecientes.shift();
    }
    
    document.getElementById("estado-camara").innerText = "🟢 DETECTANDO";
    
    // Mostrar alternativas si hay
    let alternativasHTML = "";
    if (predicciones.length > 1 && confianza < 80) {
      const pred2 = predicciones[1];
      const conf2 = (pred2.score * 100).toFixed(1);
      const clasificacion2 = clasificarTipo(pred2.class);
      
      alternativasHTML = `<br><small style="opacity: 0.6; font-size: 12px;">Alternativa: ${clasificacion2.detalle} (${conf2}%)</small>`;
    }
    
    // Mostrar cantidad de objetos detectados
    let objetosDetectados = `(${predicciones.length} objeto${predicciones.length > 1 ? 's' : ''} detectado${predicciones.length > 1 ? 's' : ''})`;
    
    document.getElementById("resultado").innerHTML = `
      <div style="line-height: 2; background: rgba(200, 255, 200, 0.2); padding: 15px; border-radius: 10px; margin-top: 10px; border: 2px solid #4caf50;">
        <strong style="font-size: 22px;">${clasificacion.tipo}</strong><br>
        <span style="font-size: 18px; font-weight: bold;">${clasificacion.detalle}</span><br>
        <small style="opacity: 0.8; font-size: 13px;">Clasificación: <strong>${clasificacion.categoria}</strong></small><br>
        <small style="opacity: 0.7; font-size: 12px;">Confianza: <strong>${confianza}%</strong> ${objetosDetectados}</small>
        ${alternativasHTML}
      </div>
    `;
    
    console.log("Predicción CocoSsd:", objeto, "→", clasificacion.detalle, "Categoría:", clasificacion.categoria, "Confianza:", confianza + "%");
  } catch (error) {
    console.error("Error en predicción:", error);
  }
}