import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, lightgrey
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

def create_pdf(filename):
    doc = SimpleDocTemplate(filename, pagesize=letter,
                            rightMargin=72, leftMargin=72,
                            topMargin=72, bottomMargin=18)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'TitleStyle', parent=styles['Heading1'], fontSize=24, spaceAfter=20, textColor=HexColor('#2c3e50'), alignment=1
    )
    h1_style = ParagraphStyle(
        'H1', parent=styles['Heading1'], fontSize=18, spaceAfter=10, textColor=HexColor('#34495e')
    )
    h2_style = ParagraphStyle(
        'H2', parent=styles['Heading2'], fontSize=14, spaceAfter=8, textColor=HexColor('#2980b9')
    )
    body_style = ParagraphStyle(
        'Body', parent=styles['Normal'], fontSize=11, spaceAfter=8, leading=14
    )
    code_style = ParagraphStyle(
        'Code', parent=styles['Code'], fontSize=9, spaceAfter=8, textColor=HexColor('#c0392b'), backColor=HexColor('#ecf0f1'), borderPadding=5
    )
    
    story = []
    
    # Portada
    story.append(Spacer(1, 150))
    story.append(Paragraph('Documento Técnico — Vocaciones STEAM API', title_style))
    story.append(Paragraph('Versión 1.0', ParagraphStyle('Sub', parent=title_style, fontSize=16, textColor=HexColor('#7f8c8d'))))
    import datetime
    story.append(Paragraph(f'{datetime.datetime.now().strftime("%d de %B de %Y")}', ParagraphStyle('Date', parent=title_style, fontSize=14, textColor=HexColor('#95a5a6'))))
    story.append(Spacer(1, 250))
    
    # Resumen general
    story.append(Paragraph('2. Resumen General', h1_style))
    story.append(Paragraph('El proyecto "Vocaciones STEAM API" es el backend de una plataforma orientada a descubrir y fomentar las vocaciones en áreas STEAM (Science, Technology, Engineering, Art, Mathematics) a través de un test vocacional. Sirve como el motor principal de datos, lógica de negocio y recomendaciones mediante IA. Está construido utilizando TypeScript, Node.js y el framework NestJS con una arquitectura de microservicios, TypeORM para interactuar con la base de datos PostgreSQL y Google Generative AI para las recomendaciones.', body_style))
    
    # Arquitectura del sistema
    story.append(Paragraph('3. Arquitectura del Sistema', h1_style))
    story.append(Paragraph('El sistema está estructurado como un monorepo administrado por NestJS, que contiene múltiples microservicios (api-gateway, auth, users, tests, ai, mail) y una biblioteca compartida (libs/common). El API Gateway (puerto 3000) expone los endpoints HTTP RESTful hacia los clientes (PWA, web) y rutea las solicitudes a los microservicios correspondientes a través de TCP, asegurando escalabilidad e independencia. Cada microservicio maneja su propio dominio de dominio, pero la base de datos PostgreSQL se comparte a través de las entidades comunes definidas en libs.', body_style))
    story.append(Paragraph('Puertos de los servicios:', h2_style))
    ports_data = [
        ['Servicio', 'Puerto', 'Protocolo'],
        ['API Gateway', '3000', 'HTTP / REST'],
        ['Auth Service', '3001', 'Microservicio TCP'],
        ['Users Service', '3002', 'Microservicio TCP'],
        ['Tests Service', '3003', 'Microservicio TCP'],
        ['AI Service', '3004', 'Microservicio TCP'],
        ['Mail Service', '3005', 'Microservicio TCP']
    ]
    t_ports = Table(ports_data, colWidths=[150, 150, 150])
    t_ports.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#bdc3c7')),
        ('TEXTCOLOR', (0, 0), (-1, 0), HexColor('#2c3e50')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, HexColor('#ecf0f1')),
    ]))
    story.append(t_ports)
    story.append(Spacer(1, 10))
    
    # Estructura de carpetas
    story.append(Paragraph('4. Estructura de Carpetas', h1_style))
    story.append(Paragraph('''El repositorio sigue una convención estándar de monorepo de NestJS:
<br/> - <b>apps/</b>: Contiene las distintas aplicaciones.<br/>
  - <b>api-gateway/</b>: Punto de entrada HTTP y Swagger.<br/>
  - <b>auth/</b>: Microservicio para registro, login y JWT.<br/>
  - <b>users/</b>: Microservicio para perfiles de usuario y configuración.<br/>
  - <b>tests/</b>: Microservicio para tests vocacionales.<br/>
  - <b>ai/</b>: Microservicio de IA para conectarse a Gemini.<br/>
  - <b>mail/</b>: Servicio de simulación/envío de correos OTP.<br/>
- <b>libs/common/</b>: Carpeta compartida con DTOs (validaciones), entidades TypeORM, y la configuración del módulo de base de datos transversal.<br/>
- <b>.env</b>: Archivo con las variables y secretos vitales.<br/>
- <b>package.json</b>: Dependencias y scripts base.
''', body_style))
    
    # Base de datos
    story.append(Paragraph('5. Base de Datos', h1_style))
    story.append(Paragraph('La API utiliza PostgreSQL con TypeORM. Las entidades principales son:', body_style))
    story.append(Paragraph('- <b>users</b>: Guarda emails, contraseñas, rol, nivel, título en el gamification.', body_style))
    story.append(Paragraph('- <b>user_settings</b>: Relacionada 1 a 1 con "users". Guarda preferencias como "darkMode", lenguaje y notificaciones.', body_style))
    story.append(Paragraph('- <b>otp_codes</b>: Almacena códigos generados para registro y recuperación de contraseñas, cuenta con tiempos de expiración.', body_style))
    story.append(Paragraph('- <b>vocational_tests</b>: Vinculado a "users" (N a 1). Guarda los puntajes STEAM y respuestas emitidas del test de un alumno.', body_style))
    story.append(Paragraph('- <b>ai_recommendations</b>: Relacionada 1 a 1 con el test. Guarda el veredicto generado por Gemini respecto a carreras y universidades.', body_style))
    
    # Microservicios
    story.append(Paragraph('6. Microservicios', h1_style))
    story.append(Paragraph('<b>API Gateway</b>: Recibe y enruta solicitudes HTTP. Tiene guards JWT y la estrategia OAuth de Google. Documenta en Swagger.', body_style))
    story.append(Paragraph('<b>Auth Service</b>: Realiza hash de contraseñas, interconecta con Postgres (tabla "users" y "otp_codes"). Genera los JWT asimétricos o simétricos.', body_style))
    story.append(Paragraph('<b>Users Service</b>: Actualiza datos del perfil (tabla "users", "user_settings").', body_style))
    story.append(Paragraph('<b>Tests Service</b>: Analiza las respuestas, asigna calificaciones a los pilares STEAM, crea registros en "vocational_tests", e invoca remotamente al servicio de IA.', body_style))
    story.append(Paragraph('<b>AI Service</b>: Envía un prompt dinámico parametrizado por región y puntajes STEAM a Gemini (genAI) mediante "@google/generative-ai".', body_style))
    story.append(Paragraph('<b>Mail Service</b>: Captura de eventos para enviar HTML emails con Nodemailer (como los OTP de verificación).', body_style))
    
    # Flujo de autenticación
    story.append(Paragraph('7. Flujo de Autenticación', h1_style))
    story.append(Paragraph('<b>1. Registro:</b> Usuario provee correo y clave. Auth crea registro inactivo y dispara el OTP por Mail Service.', body_style))
    story.append(Paragraph('<b>2. Verificación:</b> El usuario manda el OTP. Se comprueba con Postgres; si es válido la cuenta se activa y devuelve el JWT inicial.', body_style))
    story.append(Paragraph('<b>3. Login Normal:</b> Correo y clave. Si coinciden y el correo está verificado, revoca un JWT válido.', body_style))
    story.append(Paragraph('<b>4. Google OAuth:</b> Flujo /auth/google lleva a Google. Luego /auth/google/callback intercepta datos del perfil, crea o actualiza en bd el googleId, lo verifica y retorna a la PWA con un token.', body_style))
    
    # JWT
    story.append(Paragraph('8. JSON Web Token (JWT)', h1_style))
    story.append(Paragraph('El JWT es firmado por "AuthService" empleando "JWT_SECRET" (vía config module). El payload embebe el "sub" (id), "email", y "role". El API Gateway cuenta con un "JwtStrategy" basado en Passport que intercepta el encabezado Bearer, lo verifica y decodifica volcando los datos a "req.user" si se implementa el "JwtAuthGuard".', body_style))
    
    # Geolocalización
    story.append(Paragraph('9. Geolocalización', h1_style))
    story.append(Paragraph('La variable "locationInput" se recibe durante la sumisión del test de vocación. En lugar de procesarlo nativamente, este valor se deriva como contexto geográfico al modelo de IA (Gemini) en su Prompt. De esta manera, Gemini sugiere universidades locales a proximidad en dicha Ciudad/País.', body_style))
    
    # Variables de entorno
    story.append(Paragraph('10. Variables de Entorno', h1_style))
    env_data = [
        ['Variable', 'Descripción', 'Ejemplo'],
        ['PORT_GATEWAY', 'Puerto del gateway', '3000'],
        ['DB_USER/DB_PASSWORD', 'Credenciales Postgres', 'postgres'],
        ['JWT_SECRET', 'Semilla estricta del JWT', 'abc123secret...'],
        ['GOOGLE_CLIENT_ID', 'ID OAuth de GCP', 'x-client.apps...'],
        ['GEMINI_API_KEY', 'Llave para Google AI', 'AIzaSyAXXXXX']
    ]
    t_env = Table(env_data, colWidths=[150, 150, 150])
    t_env.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#bdc3c7')),
        ('TEXTCOLOR', (0, 0), (-1, 0), HexColor('#2c3e50')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, HexColor('#ecf0f1')),
    ]))
    story.append(t_env)
    story.append(Spacer(1, 10))
    
    # Levantar el Proyecto Localmente
    story.append(Paragraph('11. Cómo Levantar el Proyecto Localmente', h1_style))
    story.append(Paragraph('''<b>Paso 1:</b> Clonar el proyecto y abrir una terminal.<br/>
<b>Paso 2:</b> Ejecutar `npm install` para instalar dependencias.<br/>
<b>Paso 3:</b> Configurar el archivo `.env` garantizando accesos a la base de datos.<br/>
<b>Paso 4:</b> Levantar PostgreSQL y colocar crear una Base de Datos `steam_vocations`.<br/>
<b>Paso 5:</b> Ejecutar el archivo SQL para estructurar la DB.<br/>
<b>Paso 6:</b> Ejecutar los microservicios en múltiples terminales o usando npm run start:dev [nombre-app]:<br/>
npm run start:dev api-gateway<br/>
npm run start:dev auth ...
''', body_style))
    
    # Probar la API
    story.append(Paragraph('12. Cómo Probar la API', h1_style))
    story.append(Paragraph('La plataforma principal para probar manualmente la API es Swagger. Al iniciar todos los servicios, abre un navegador en:', body_style))
    story.append(Paragraph('http://localhost:3000/api', code_style))
    story.append(Paragraph('Podrás inspeccionar todos los endpoints DTO. Para acceder a rutas protegidas, regístrate a través del endpoint /auth/register, recupera tu JWT en el /auth/login, y pega el string Bearer en el candado "Authorize" verde.', body_style))

    doc.build(story)

if __name__ == '__main__':
    create_pdf('documento_tecnico_vocaciones_steam.pdf')
