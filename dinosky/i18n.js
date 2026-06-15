const STORAGE_KEY = 'dynoLanguage';

const LOCALES = {
    en: {
        // Loading screen
        loading_title: 'Loading',
        loading_status: 'Preparing level...',
        loading_detail: 'Please wait',
        loading_phase: 'Loading',
        loading_preview_label: 'Loading dyno',
        loading_preview_ready: 'Dyno ready',
        loading_failed_status: 'Loading failed.',
        loading_error_phase: 'Error',

        // Game over
        game_over_title: 'Game Over',
        game_over_retry: 'Retry',
        game_over_revive: 'Revive',

        // Settings
        settings_title: 'Settings',
        settings_close_label: 'Close settings',
        settings_sfx: 'SFX',
        settings_sfx_label: 'Sound effects',
        settings_ambience: 'Ambience',
        settings_ambience_label: 'Ambience sounds',
        settings_music: 'Music',
        settings_music_label: 'Music',
        settings_your_name: 'Your name',
        settings_quality: 'Quality',
        settings_quality_label: 'Graphics quality',
        settings_quality_auto: 'Auto',
        settings_quality_high: 'High',
        settings_quality_low: 'Low',
        settings_fullscreen: 'Fullscreen',
        settings_fullscreen_label: 'Toggle desktop fullscreen',
        settings_language: 'Language',
        settings_quit: 'Quit game',
        settings_quit_btn: 'Quit',
        settings_restart_missions: 'Restart missions',
        settings_restart_btn: 'Restart',
        settings_restart_confirm: 'Are you sure?',
        settings_reset_all: 'Reset all data',
        settings_reset_all_btn: 'Reset all',
        loading_go: 'GO',
        loading_ready_detail: 'Press GO to start the level',
        loading_ready_phase: 'Ready',
        
        // Cinematic overlay
        cinematic_skip: 'Skip',

        // Dyno Fury HUD
        fury_label: 'FURY',
        fury_ready: 'FURY READY',
        'rage.ready': 'RAGE READY',

        // Keyboard key labels (shown on the on-screen keyboard buttons)
        key_fire: 'SPACE',
        key_speed: 'SHIFT',

        // Mission dialog — start/complete
        mission_default_title: 'MISSION',
        mission_go: 'GO',
        mission_failed_title: 'MISSION FAILED',
        mission_retry: 'RETRY',
        mission_continue: 'CONTINUE',
        mission_complete_suffix: 'complete',
        mission_failed_suffix: 'failed',
        mission_timeout_prefix: 'You ran out of time for',
        mission_reward_label: (n) => `Reward: ${n} coins`,
        mission_continue_coins: (n) => `CONTINUE  +${n}`,
        mission_double_coins: (n) => `WATCH AD  +${n}`,

        // Mission dialog — cancel
        mission_abandon_title: 'ABANDON MISSION?',
        mission_abandon_named: (title) => `Cancel "${title}" and start a new mission?`,
        mission_abandon_generic: 'Cancel the current mission and start a new one?',
        mission_yes: 'YES',
        mission_no: 'NO',

        // Mission dialog — leaderboard
        mission_your_name: 'YOUR NAME',
        mission_your_time: 'YOUR TIME',
        mission_your_best_times: 'YOUR BEST TIMES',
        mission_global_top: 'GLOBAL TOP 100',
        mission_new_record: 'NEW',

        // Active mission UI
        race_ring: (index, total) => `Ring ${index}/${total}`,

        // Mission data
        mission_000_title: 'MISSION',
        mission_000_description: 'Put the statue back on the pedestal',
        mission_000_callout: 'Return the statue!',
        mission_000_objects_fail: 'Not enough statues in the level to complete this mission.',

        mission_001_title: 'MISSION',
        mission_001_description: 'Fly to the top of the highest tree',
        mission_001_callout: 'Fly to the treetop!',

        mission_003_title: 'MISSION',
        mission_003_description: 'Place one car on a roof',
        mission_003_objects_fail: 'Not enough cars in the level to complete this mission.',
        mission_003_callout: 'Place one car on a roof!',

        mission_race_01_title: 'RACE',
        mission_race_01_description: 'Fly through all the rings as fast as you can!',
        mission_race_01_callout: 'Race through the rings!',

        mission_race_02_title: 'RACE',
        mission_race_02_description: 'Fly through all the rings as fast as you can!',
        mission_race_02_callout: 'Race through the rings!',

        mission_race_03_title: 'RACE',
        mission_race_03_description: 'Fly through all the rings as fast as you can!',
        mission_race_03_callout: 'Race through the rings!',

        mission_statues_title: 'HIDDEN MISSION',
        mission_statues_description: 'Repair the statues!',

        mission_destroy_tanks_01_title: 'MISSION',
        mission_destroy_tanks_01_description: 'Destroy 2 tanks as fast as you can!',
        mission_destroy_tanks_01_callout: 'Destroy 2 tanks!',

        mission_destroy_planes_01_title: 'MISSION',
        mission_destroy_planes_01_description: 'Destroy 2 planes as fast as you can!',
        mission_destroy_planes_01_callout: 'Destroy 2 planes!',

        mission_shark_title: 'MISSION',
        mission_shark_description: 'Put a shark in the sharktank!',

        // Dyno Skin Shop
        'skins.title': 'Dyno Skins',
        'skins.close': 'Close shop',
        'skins.prev': 'Previous skin',
        'skins.next': 'Next skin',
        'skins.buy': 'Buy',
        'skins.equip': 'Equip',
        'skins.equipped': 'Equipped',
        'skins.owned': 'Owned',
        'skins.notEnoughCoins': 'Not enough coins',
        'skins.getExtraCoins': 'Get extra coins!',
        'skins.watchAd': 'Watch Ad',
        'skins.watchAdSub': 'Watch a short video and get extra coins.',
        'skins.classic': 'Classic Dyno',
        'skins.earth': 'Earth Dyno',
        'skins.ice': 'Sapphire Dyno',
        'skins.lava': 'Emerald Dyno',
        'skins.forest': 'Seismic Dyno',
        'skins.shadow': 'Blizzard Dyno',
        'skins.gold': 'Phantasy Dyno',
    },

    nl: {
        // Loading screen
        loading_title: 'Laden',
        loading_status: 'Level voorbereiden...',
        loading_detail: 'Even geduld',
        loading_phase: 'Laden',
        loading_preview_label: 'Draak laden',
        loading_preview_ready: 'Draak klaar',
        loading_failed_status: 'Laden mislukt.',
        loading_error_phase: 'Fout',

        // Game over
        game_over_title: 'Game Over',
        game_over_retry: 'Opnieuw',
        game_over_revive: 'Herleven',

        // Settings
        settings_title: 'Instellingen',
        settings_close_label: 'Instellingen sluiten',
        settings_sfx: 'Geluiden',
        settings_sfx_label: 'Geluidseffecten',
        settings_ambience: 'Sfeer',
        settings_ambience_label: 'Sfeermuziek',
        settings_music: 'Muziek',
        settings_music_label: 'Muziek',
        settings_your_name: 'Jouw naam',
        settings_quality: 'Kwaliteit',
        settings_quality_label: 'Grafische kwaliteit',
        settings_quality_auto: 'Automatisch',
        settings_quality_high: 'Hoog',
        settings_quality_low: 'Laag',
        settings_fullscreen: 'Volledig scherm',
        settings_fullscreen_label: 'Desktop volledig scherm schakelen',
        settings_language: 'Taal',
        settings_quit: 'Spel afsluiten',
        settings_quit_btn: 'Afsluiten',
        settings_restart_missions: 'Missies herstarten',
        settings_restart_btn: 'Herstarten',
        settings_restart_confirm: 'Weet je het zeker?',
        settings_reset_all: 'Alle data wissen',
        settings_reset_all_btn: 'Alles wissen',
        loading_go: 'START',
        loading_ready_detail: 'Druk op START om het level te beginnen',
        loading_ready_phase: 'Klaar',

        // Cinematic overlay
        cinematic_skip: 'Overslaan',

        // Dyno Fury HUD
        fury_label: 'FURY',
        fury_ready: 'FURY KLAAR',
        'rage.ready': 'FURY KLAAR',

        // Keyboard key labels
        key_fire: 'SPATIE',
        key_speed: 'SHIFT',

        // Mission dialog — start/complete
        mission_default_title: 'MISSIE',
        mission_go: 'START',
        mission_failed_title: 'MISSIE MISLUKT',
        mission_retry: 'OPNIEUW',
        mission_continue: 'VERDER',
        mission_complete_suffix: 'voltooid',
        mission_failed_suffix: 'mislukt',
        mission_timeout_prefix: 'De tijd is op voor',
        mission_reward_label: (n) => `Beloning: ${n} munten`,
        mission_continue_coins: (n) => `VERDER  +${n}`,
        mission_double_coins: (n) => `KIJK AD  +${n}`,

        // Mission dialog — cancel
        mission_abandon_title: 'MISSIE AFBREKEN?',
        mission_abandon_named: (title) => `"${title}" annuleren en een nieuwe missie starten?`,
        mission_abandon_generic: 'De huidige missie annuleren en een nieuwe starten?',
        mission_yes: 'JA',
        mission_no: 'NEE',

        // Mission dialog — leaderboard
        mission_your_name: 'JOUW NAAM',
        mission_your_time: 'JOUW TIJD',
        mission_your_best_times: 'JOUW BESTE TIJDEN',
        mission_global_top: 'GLOBALE TOP 100',
        mission_new_record: 'NIEUW',

        // Active mission UI
        race_ring: (index, total) => `Ring ${index}/${total}`,

        // Mission data
        mission_000_title: 'MISSIE',
        mission_000_description: 'Zet het standbeeld terug op de sokkel',
        mission_000_callout: 'Breng het standbeeld terug!',
        mission_000_objects_fail: 'Niet genoeg standbeelden in het level om deze missie te voltooien.',

        mission_001_title: 'MISSIE',
        mission_001_description: 'Vlieg naar de top van de hoogste boom',
        mission_001_callout: 'Vlieg naar de boomtop!',

        mission_003_title: 'MISSIE',
        mission_003_description: 'Zet één auto op een dak',
        mission_003_objects_fail: 'Niet genoeg auto\'s in het level om deze missie te voltooien.',
        mission_003_callout: 'Zet één auto op een dak!',

        mission_race_01_title: 'RACE',
        mission_race_01_description: 'Vlieg zo snel mogelijk door alle ringen!',
        mission_race_01_callout: 'Race door de ringen!',

        mission_race_02_title: 'RACE',
        mission_race_02_description: 'Vlieg zo snel mogelijk door alle ringen!',
        mission_race_02_callout: 'Race door de ringen!',

        mission_race_03_title: 'RACE',
        mission_race_03_description: 'Vlieg zo snel mogelijk door alle ringen!',
        mission_race_03_callout: 'Race door de ringen!',

        mission_statues_title: 'VERBORGEN MISSIE',
        mission_statues_description: 'Herstel de standbeelden!',

        mission_destroy_tanks_01_title: 'MISSIE',
        mission_destroy_tanks_01_description: 'Vernietig 2 tanks zo snel als je kunt!',
        mission_destroy_tanks_01_callout: 'Vernietig 2 tanks!',

        mission_destroy_planes_01_title: 'MISSIE',
        mission_destroy_planes_01_description: 'Vernietig 2 vliegtuigen zo snel als je kunt!',
        mission_destroy_planes_01_callout: 'Vernietig 2 vliegtuigen!',

        mission_shark_title: 'MISSIE',
        mission_shark_description: 'Zet een haai in de haaientank!',

        // Dyno Skin Shop
        'skins.title': 'Draak Skins',
        'skins.close': 'Winkel sluiten',
        'skins.prev': 'Vorige skin',
        'skins.next': 'Volgende skin',
        'skins.buy': 'Kopen',
        'skins.equip': 'Aandoen',
        'skins.equipped': 'Uitgerust',
        'skins.owned': 'Eigendom',
        'skins.notEnoughCoins': 'Niet genoeg munten',
        'skins.getExtraCoins': 'Extra munten verdienen!',
        'skins.watchAd': 'Bekijk video',
        'skins.watchAdSub': 'Bekijk een korte video en ontvang extra munten.',
        'skins.classic': 'Klassieke Draak',
        'skins.earth': 'Aarde Draak',
        'skins.ice': 'Saffier Draak',
        'skins.lava': 'Smaragd Draak',
        'skins.forest': 'Seismische Draak',
        'skins.shadow': 'Sneeuw Draak',
        'skins.gold': 'Fantasie Draak',
    },

    es: {
        // Loading screen
        loading_title: 'Cargando',
        loading_status: 'Preparando nivel...',
        loading_detail: 'Por favor espera',
        loading_phase: 'Cargando',
        loading_preview_label: 'Cargando dragón',
        loading_preview_ready: 'Dragón listo',
        loading_failed_status: 'Error al cargar.',
        loading_error_phase: 'Error',

        // Game over
        game_over_title: 'Game Over',
        game_over_retry: 'Reintentar',
        game_over_revive: 'Revivir',

        // Settings
        settings_title: 'Ajustes',
        settings_close_label: 'Cerrar ajustes',
        settings_sfx: 'SFX',
        settings_sfx_label: 'Efectos de sonido',
        settings_ambience: 'Ambiente',
        settings_ambience_label: 'Sonidos de ambiente',
        settings_music: 'Música',
        settings_music_label: 'Música',
        settings_your_name: 'Tu nombre',
        settings_quality: 'Calidad',
        settings_quality_label: 'Calidad gráfica',
        settings_quality_auto: 'Automático',
        settings_quality_high: 'Alta',
        settings_quality_low: 'Baja',
        settings_fullscreen: 'Pantalla completa',
        settings_fullscreen_label: 'Alternar pantalla completa del escritorio',
        settings_language: 'Idioma',
        settings_quit: 'Salir del juego',
        settings_quit_btn: 'Salir',
        settings_restart_missions: 'Reiniciar misiones',
        settings_restart_btn: 'Reiniciar',
        settings_restart_confirm: '¿Estás seguro?',
        settings_reset_all: 'Borrar todos los datos',
        settings_reset_all_btn: 'Borrar todo',
        loading_go: 'IR',
        loading_ready_detail: 'Pulsa IR para comenzar el nivel',
        loading_ready_phase: 'Listo',

        // Cinematic overlay
        cinematic_skip: 'Saltar',

        // Dyno Fury HUD
        fury_label: 'FURIA',
        fury_ready: 'FURIA LISTA',
        'rage.ready': 'FURIA LISTA',

        // Keyboard key labels
        key_fire: 'ESPACIO',
        key_speed: 'SHIFT',

        // Mission dialog — start/complete
        mission_default_title: 'MISIÓN',
        mission_go: 'IR',
        mission_failed_title: 'MISIÓN FALLIDA',
        mission_retry: 'REINTENTAR',
        mission_continue: 'CONTINUAR',
        mission_complete_suffix: 'completada',
        mission_failed_suffix: 'fallida',
        mission_timeout_prefix: 'Se agotó el tiempo para',

        // Mission dialog — cancel
        mission_abandon_title: '¿ABANDONAR MISIÓN?',
        mission_abandon_named: (title) => `¿Cancelar "${title}" e iniciar una nueva misión?`,
        mission_abandon_generic: '¿Cancelar la misión actual e iniciar una nueva?',
        mission_yes: 'SÍ',
        mission_no: 'NO',

        // Mission dialog — leaderboard
        mission_your_name: 'TU NOMBRE',
        mission_your_time: 'TU TIEMPO',
        mission_your_best_times: 'TUS MEJORES TIEMPOS',
        mission_global_top: 'TOP 100 MUNDIAL',
        mission_new_record: 'NUEVO',

        // Active mission UI
        race_ring: (index, total) => `Aro ${index}/${total}`,

        // Mission data
        mission_000_title: 'MISIÓN',
        mission_000_description: 'Devuelve la estatua al pedestal',
        mission_000_callout: '¡Devuelve la estatua!',
        mission_000_objects_fail: 'No hay suficientes estatuas en el nivel para completar esta misión.',

        mission_001_title: 'MISIÓN',
        mission_001_description: 'Vuela a la cima del árbol más alto',
        mission_001_callout: '¡Vuela a la copa del árbol!',

        mission_003_title: 'MISIÓN',
        mission_003_description: 'Coloca un coche en un tejado',
        mission_003_objects_fail: 'No hay suficientes coches en el nivel para completar esta misión.',
        mission_003_callout: '¡Coloca un coche en un tejado!',

        mission_race_01_title: 'CARRERA',
        mission_race_01_description: '¡Vuela por todos los aros lo más rápido que puedas!',
        mission_race_01_callout: '¡Corre por los aros!',

        mission_race_02_title: 'CARRERA',
        mission_race_02_description: '¡Vuela por todos los aros lo más rápido que puedas!',
        mission_race_02_callout: '¡Corre por los aros!',
        
        mission_race_03_title: 'CARRERA',
        mission_race_03_description: '¡Vuela por todos los aros lo más rápido que puedas!',
        mission_race_03_callout: '¡Corre por los aros!',

        mission_destroy_tanks_01_title: 'MISIÓN',
        mission_destroy_tanks_01_description: '¡Destruye 2 tanques lo más rápido que puedas!',
        mission_destroy_tanks_01_callout: '¡Destruye 2 tanques!',
        mission_destroy_planes_01_title: 'MISIÓN',
        mission_destroy_planes_01_description: '¡Destruye 2 aviones lo más rápido que puedas!',
        mission_destroy_planes_01_callout: '¡Destruye 2 aviones!',

        mission_statues_title: 'MISIÓN OCULTA',
        mission_statues_description: '¡Repara las estatuas!',

        mission_shark_title: 'MISIÓN',
        mission_shark_description: '¡Mete un tiburón en el tanque de tiburones!',

        // Dyno Skin Shop
        'skins.title': 'Pieles de Dragón',
        'skins.close': 'Cerrar tienda',
        'skins.prev': 'Piel anterior',
        'skins.next': 'Piel siguiente',
        'skins.buy': 'Comprar',
        'skins.equip': 'Equipar',
        'skins.equipped': 'Equipado',
        'skins.owned': 'Poseído',
        'skins.notEnoughCoins': 'Monedas insuficientes',
        'skins.getExtraCoins': '¡Consigue monedas extra!',
        'skins.watchAd': 'Ver anuncio',
        'skins.watchAdSub': 'Mira un vídeo corto y obtén monedas extra.',
        'skins.classic': 'Dragón Clásico',
        'skins.earth': 'Dragón Tierra',
        'skins.ice': 'Dragón Zafiro',
        'skins.lava': 'Dragón Esmeralda',
        'skins.forest': 'Dragón Sísmico',
        'skins.shadow': 'Dragón Ventisca',
        'skins.gold': 'Dragón Fantasía',
    },

    pt: {
        // Loading screen
        loading_title: 'Carregando',
        loading_status: 'Preparando fase...',
        loading_detail: 'Aguarde',
        loading_phase: 'Carregando',
        loading_preview_label: 'Carregando dragão',
        loading_preview_ready: 'Dragão pronto',
        loading_failed_status: 'Falha ao carregar.',
        loading_error_phase: 'Erro',

        // Game over
        game_over_title: 'Game Over',
        game_over_retry: 'Tentar de novo',
        game_over_revive: 'Reviver',

        // Settings
        settings_title: 'Configurações',
        settings_close_label: 'Fechar configurações',
        settings_sfx: 'SFX',
        settings_sfx_label: 'Efeitos sonoros',
        settings_ambience: 'Ambiente',
        settings_ambience_label: 'Sons de ambiente',
        settings_music: 'Música',
        settings_music_label: 'Música',
        settings_your_name: 'Seu nome',
        settings_quality: 'Qualidade',
        settings_quality_label: 'Qualidade gráfica',
        settings_quality_auto: 'Automático',
        settings_quality_high: 'Alta',
        settings_quality_low: 'Baixa',
        settings_fullscreen: 'Tela cheia',
        settings_fullscreen_label: 'Alternar tela cheia do desktop',
        settings_language: 'Idioma',
        settings_quit: 'Sair do jogo',
        settings_quit_btn: 'Sair',
        settings_restart_missions: 'Reiniciar missões',
        settings_restart_btn: 'Reiniciar',
        settings_restart_confirm: 'Tem certeza?',
        settings_reset_all: 'Apagar todos os dados',
        settings_reset_all_btn: 'Apagar tudo',
        loading_go: 'IR',
        loading_ready_detail: 'Pressione IR para começar a fase',
        loading_ready_phase: 'Pronto',

        // Cinematic overlay
        cinematic_skip: 'Pular',

        // Dyno Fury HUD
        fury_label: 'FÚRIA',
        fury_ready: 'FÚRIA PRONTA',
        'rage.ready': 'FÚRIA PRONTA',

        // Keyboard key labels
        key_fire: 'ESPAÇO',
        key_speed: 'SHIFT',

        // Mission dialog — start/complete
        mission_default_title: 'MISSÃO',
        mission_go: 'IR',
        mission_failed_title: 'MISSÃO FALHOU',
        mission_retry: 'TENTAR DE NOVO',
        mission_continue: 'CONTINUAR',
        mission_complete_suffix: 'concluída',
        mission_failed_suffix: 'falhou',
        mission_timeout_prefix: 'O tempo acabou para',

        // Mission dialog — cancel
        mission_abandon_title: 'ABANDONAR MISSÃO?',
        mission_abandon_named: (title) => `Cancelar "${title}" e iniciar uma nova missão?`,
        mission_abandon_generic: 'Cancelar a missão atual e iniciar uma nova?',
        mission_yes: 'SIM',
        mission_no: 'NÃO',

        // Mission dialog — leaderboard
        mission_your_name: 'SEU NOME',
        mission_your_time: 'SEU TEMPO',
        mission_your_best_times: 'SEUS MELHORES TEMPOS',
        mission_global_top: 'TOP 100 MUNDIAL',
        mission_new_record: 'NOVO',

        // Active mission UI
        race_ring: (index, total) => `Anel ${index}/${total}`,

        // Mission data
        mission_000_title: 'MISSÃO',
        mission_000_description: 'Coloque a estátua de volta no pedestal',
        mission_000_callout: 'Devolva a estátua!',
        mission_000_objects_fail: 'Não há estátuas suficientes no nível para completar esta missão.',

        mission_001_title: 'MISSÃO',
        mission_001_description: 'Voe até o topo da árvore mais alta',
        mission_001_callout: 'Voe até o topo da árvore!',

        mission_003_title: 'MISSÃO',
        mission_003_description: 'Coloque um carro em um telhado',
        mission_003_objects_fail: 'Não há carros suficientes no nível para completar esta missão.',
        mission_003_callout: 'Coloque um carro em um telhado!',

        mission_race_01_title: 'CORRIDA',
        mission_race_01_description: 'Voe por todos os anéis o mais rápido que puder!',
        mission_race_01_callout: 'Corra pelos anéis!',

        mission_race_02_title: 'CORRIDA',
        mission_race_02_description: 'Voe por todos os anéis o mais rápido que puder!',
        mission_race_02_callout: 'Corra pelos anéis!',

        mission_race_03_title: 'CORRIDA',
        mission_race_03_description: 'Voe por todos os anéis o mais rápido que puder!',
        mission_race_03_callout: 'Corra pelos anéis!',

        mission_destroy_tanks_01_title: 'MISSÃO',
        mission_destroy_tanks_01_description: 'Destrua 2 tanques o mais rápido que puder!',
        mission_destroy_tanks_01_callout: 'Destrua 2 tanques!',
        mission_destroy_planes_01_title: 'MISSÃO',
        mission_destroy_planes_01_description: 'Destrua 2 aviões o mais rápido que puder!',
        mission_destroy_planes_01_callout: 'Destrua 2 aviões!',

        mission_statues_title: 'MISSÃO OCULTA',
        mission_statues_description: 'Restaure as estátuas!',

        mission_shark_title: 'MISSÃO',
        mission_shark_description: 'Coloque um tubarão no tanque de tubarões!',

        // Dyno Skin Shop
        'skins.title': 'Skins do Dragão',
        'skins.close': 'Fechar loja',
        'skins.prev': 'Skin anterior',
        'skins.next': 'Próxima skin',
        'skins.buy': 'Comprar',
        'skins.equip': 'Equipar',
        'skins.equipped': 'Equipado',
        'skins.owned': 'Possuído',
        'skins.notEnoughCoins': 'Moedas insuficientes',
        'skins.getExtraCoins': 'Ganhe moedas extras!',
        'skins.watchAd': 'Ver anúncio',
        'skins.watchAdSub': 'Assista a um vídeo curto e ganhe moedas extras.',
        'skins.classic': 'Dragão Clássico',
        'skins.earth': 'Dragão Terra',
        'skins.ice': 'Dragão Safira',
        'skins.lava': 'Dragão Esmeralda',
        'skins.forest': 'Dragão Sísmico',
        'skins.shadow': 'Dragão Nevasca',
        'skins.gold': 'Dragão Fantasia',
    },

    de: {
        // Loading screen
        loading_title: 'Laden',
        loading_status: 'Level wird vorbereitet...',
        loading_detail: 'Bitte warten',
        loading_phase: 'Laden',
        loading_preview_label: 'Drache wird geladen',
        loading_preview_ready: 'Drache bereit',
        loading_failed_status: 'Laden fehlgeschlagen.',
        loading_error_phase: 'Fehler',

        // Game over
        game_over_title: 'Game Over',
        game_over_retry: 'Nochmal',
        game_over_revive: 'Wiederbeleben',

        // Settings
        settings_title: 'Einstellungen',
        settings_close_label: 'Einstellungen schließen',
        settings_sfx: 'SFX',
        settings_sfx_label: 'Soundeffekte',
        settings_ambience: 'Ambiente',
        settings_ambience_label: 'Umgebungsklänge',
        settings_music: 'Musik',
        settings_music_label: 'Musik',
        settings_your_name: 'Dein Name',
        settings_quality: 'Qualität',
        settings_quality_label: 'Grafikqualität',
        settings_quality_auto: 'Automatisch',
        settings_quality_high: 'Hoch',
        settings_quality_low: 'Niedrig',
        settings_fullscreen: 'Vollbild',
        settings_fullscreen_label: 'Desktop-Vollbild umschalten',
        settings_language: 'Sprache',
        settings_quit: 'Spiel beenden',
        settings_quit_btn: 'Beenden',
        settings_restart_missions: 'Missionen neu starten',
        settings_restart_btn: 'Neu starten',
        settings_restart_confirm: 'Bist du sicher?',
        settings_reset_all: 'Alle Daten löschen',
        settings_reset_all_btn: 'Alles löschen',
        loading_go: 'LOS',
        loading_ready_detail: 'Drücke LOS um das Level zu starten',
        loading_ready_phase: 'Bereit',

        // Cinematic overlay
        cinematic_skip: 'Überspringen',

        // Dyno Fury HUD
        fury_label: 'FURY',
        fury_ready: 'FURY BEREIT',
        'rage.ready': 'FURY BEREIT',

        // Keyboard key labels
        key_fire: 'LEERTASTE',
        key_speed: 'SHIFT',

        // Mission dialog — start/complete
        mission_default_title: 'MISSION',
        mission_go: 'LOS',
        mission_failed_title: 'MISSION GESCHEITERT',
        mission_retry: 'NOCHMAL',
        mission_continue: 'WEITER',
        mission_complete_suffix: 'abgeschlossen',
        mission_failed_suffix: 'gescheitert',
        mission_timeout_prefix: 'Die Zeit ist abgelaufen für',

        // Mission dialog — cancel
        mission_abandon_title: 'MISSION ABBRECHEN?',
        mission_abandon_named: (title) => `"${title}" abbrechen und eine neue Mission starten?`,
        mission_abandon_generic: 'Aktuelle Mission abbrechen und eine neue starten?',
        mission_yes: 'JA',
        mission_no: 'NEIN',

        // Mission dialog — leaderboard
        mission_your_name: 'DEIN NAME',
        mission_your_time: 'DEINE ZEIT',
        mission_your_best_times: 'DEINE BESTZEITEN',
        mission_global_top: 'GLOBALE TOP 100',
        mission_new_record: 'NEU',

        // Active mission UI
        race_ring: (index, total) => `Ring ${index}/${total}`,

        // Mission data
        mission_000_title: 'MISSION',
        mission_000_description: 'Stelle die Statue zurück auf den Sockel',
        mission_000_callout: 'Bring die Statue zurück!',
        mission_000_objects_fail: 'Nicht genug Statuen im Level, um diese Mission abzuschließen.',

        mission_001_title: 'MISSION',
        mission_001_description: 'Fliege zur Spitze des höchsten Baums',
        mission_001_callout: 'Fliege zur Baumspitze!',

        mission_003_title: 'MISSION',
        mission_003_description: 'Stelle ein Auto auf ein Dach',
        mission_003_objects_fail: 'Nicht genug Autos im Level, um diese Mission abzuschließen.',
        mission_003_callout: 'Stelle ein Auto auf ein Dach!',

        mission_race_01_title: 'RENNEN',
        mission_race_01_description: 'Fliege so schnell wie möglich durch alle Ringe!',
        mission_race_01_callout: 'Renne durch die Ringe!',

        mission_race_02_title: 'RENNEN',
        mission_race_02_description: 'Fliege so schnell wie möglich durch alle Ringe!',
        mission_race_02_callout: 'Renne durch die Ringe!',

        mission_race_03_title: 'RENNEN',
        mission_race_03_description: 'Fliege so schnell wie möglich durch alle Ringe!',
        mission_race_03_callout: 'Renne durch die Ringe!',

        mission_destroy_tanks_01_title: 'MISSION',
        mission_destroy_tanks_01_description: 'Zerstöre 2 Panzer so schnell du kannst!',
        mission_destroy_tanks_01_callout: 'Zerstöre 2 Panzer!',
        mission_destroy_planes_01_title: 'MISSION',
        mission_destroy_planes_01_description: 'Zerstöre 2 Flugzeuge so schnell du kannst!',
        mission_destroy_planes_01_callout: 'Zerstöre 2 Flugzeuge!',

        mission_statues_title: 'GEHEIME MISSION',
        mission_statues_description: 'Repariere die Statuen!',

        mission_shark_title: 'MISSION',
        mission_shark_description: 'Wirf einen Hai in das Haibecken!',

        // Dyno Skin Shop
        'skins.title': 'Drachen-Skins',
        'skins.close': 'Shop schließen',
        'skins.prev': 'Vorheriger Skin',
        'skins.next': 'Nächster Skin',
        'skins.buy': 'Kaufen',
        'skins.equip': 'Anlegen',
        'skins.equipped': 'Angelegt',
        'skins.owned': 'Besessen',
        'skins.notEnoughCoins': 'Nicht genug Münzen',
        'skins.getExtraCoins': 'Extra Münzen verdienen!',
        'skins.watchAd': 'Video ansehen',
        'skins.watchAdSub': 'Sieh dir ein kurzes Video an und erhalte extra Münzen.',
        'skins.classic': 'Klassischer Drache',
        'skins.earth': 'Erddrache',
        'skins.ice': 'Saphirdrache',
        'skins.lava': 'Smaragddrache',
        'skins.forest': 'Seismischer Drache',
        'skins.shadow': 'Blizzarddrache',
        'skins.gold': 'Phantasiedrache',
    },

    fr: {
        // Loading screen
        loading_title: 'Chargement',
        loading_status: 'Préparation du niveau...',
        loading_detail: 'Veuillez patienter',
        loading_phase: 'Chargement',
        loading_preview_label: 'Chargement du dyno',
        loading_preview_ready: 'Dyno prêt',
        loading_failed_status: 'Échec du chargement.',
        loading_error_phase: 'Erreur',

        // Game over
        game_over_title: 'Game Over',
        game_over_retry: 'Réessayer',
        game_over_revive: 'Revivre',

        // Settings
        settings_title: 'Paramètres',
        settings_close_label: 'Fermer les paramètres',
        settings_sfx: 'SFX',
        settings_sfx_label: 'Effets sonores',
        settings_ambience: 'Ambiance',
        settings_ambience_label: 'Sons d\'ambiance',
        settings_music: 'Musique',
        settings_music_label: 'Musique',
        settings_your_name: 'Votre nom',
        settings_quality: 'Qualité',
        settings_quality_label: 'Qualité graphique',
        settings_quality_auto: 'Automatique',
        settings_quality_high: 'Élevée',
        settings_quality_low: 'Faible',
        settings_fullscreen: 'Plein écran',
        settings_fullscreen_label: 'Basculer le plein écran du bureau',
        settings_language: 'Langue',
        settings_quit: 'Quitter le jeu',
        settings_quit_btn: 'Quitter',
        settings_restart_missions: 'Recommencer les missions',
        settings_restart_btn: 'Recommencer',
        settings_restart_confirm: 'Êtes-vous sûr ?',
        settings_reset_all: 'Effacer toutes les données',
        settings_reset_all_btn: 'Tout effacer',
        loading_go: 'GO',
        loading_ready_detail: 'Appuyez sur GO pour démarrer le niveau',
        loading_ready_phase: 'Prêt',

        // Cinematic overlay
        cinematic_skip: 'Passer',

        // Dyno Fury HUD
        fury_label: 'FUREUR',
        fury_ready: 'FUREUR PRÊTE',
        'rage.ready': 'FUREUR PRÊTE',

        // Keyboard key labels
        key_fire: 'ESPACE',
        key_speed: 'SHIFT',

        // Mission dialog — start/complete
        mission_default_title: 'MISSION',
        mission_go: 'GO',
        mission_failed_title: 'MISSION ÉCHOUÉE',
        mission_retry: 'RÉESSAYER',
        mission_continue: 'CONTINUER',
        mission_complete_suffix: 'accomplie',
        mission_failed_suffix: 'échouée',
        mission_timeout_prefix: 'Le temps est écoulé pour',

        // Mission dialog — cancel
        mission_abandon_title: 'ABANDONNER LA MISSION ?',
        mission_abandon_named: (title) => `Annuler "${title}" et démarrer une nouvelle mission ?`,
        mission_abandon_generic: 'Annuler la mission actuelle et en démarrer une nouvelle ?',
        mission_yes: 'OUI',
        mission_no: 'NON',

        // Mission dialog — leaderboard
        mission_your_name: 'VOTRE NOM',
        mission_your_time: 'VOTRE TEMPS',
        mission_your_best_times: 'VOS MEILLEURS TEMPS',
        mission_global_top: 'TOP 100 MONDIAL',
        mission_new_record: 'NOUVEAU',

        // Active mission UI
        race_ring: (index, total) => `Anneau ${index}/${total}`,

        // Mission data
        mission_000_title: 'MISSION',
        mission_000_description: 'Remettez la statue sur le piédestal',
        mission_000_callout: 'Ramenez la statue !',
        mission_000_objects_fail: 'Pas assez de statues dans le niveau pour accomplir cette mission.',

        mission_001_title: 'MISSION',
        mission_001_description: 'Volez jusqu\'au sommet du plus grand arbre',
        mission_001_callout: 'Volez jusqu\'à la cime !',

        mission_003_title: 'MISSION',
        mission_003_description: 'Posez une voiture sur un toit',
        mission_003_objects_fail: 'Pas assez de voitures dans le niveau pour accomplir cette mission.',
        mission_003_callout: 'Posez une voiture sur un toit !',

        mission_race_01_title: 'COURSE',
        mission_race_01_description: 'Volez à travers tous les anneaux le plus vite possible !',
        mission_race_01_callout: 'Foncez à travers les anneaux !',

        mission_race_02_title: 'COURSE',
        mission_race_02_description: 'Volez à travers tous les anneaux le plus vite possible !',
        mission_race_02_callout: 'Foncez à travers les anneaux !',

        mission_race_03_title: 'COURSE',
        mission_race_03_description: 'Volez à travers tous les anneaux le plus vite possible !',
        mission_race_03_callout: 'Foncez à travers les anneaux !',

        mission_destroy_tanks_01_title: 'MISSION',
        mission_destroy_tanks_01_description: 'Détruisez 2 chars le plus vite possible !',
        mission_destroy_tanks_01_callout: 'Détruisez 2 chars !',
        mission_destroy_planes_01_title: 'MISSION',
        mission_destroy_planes_01_description: 'Détruisez 2 avions le plus vite possible !',
        mission_destroy_planes_01_callout: 'Détruisez 2 avions !',

        mission_statues_title: 'MISSION CACHÉE',
        mission_statues_description: 'Réparez les statues !',

        mission_shark_title: 'MISSION',
        mission_shark_description: 'Mettez un requin dans le bassin à requins !',

        // Dyno Skin Shop
        'skins.title': 'Skins du Dyno',
        'skins.close': 'Fermer la boutique',
        'skins.prev': 'Skin précédent',
        'skins.next': 'Skin suivant',
        'skins.buy': 'Acheter',
        'skins.equip': 'Équiper',
        'skins.equipped': 'Équipé',
        'skins.owned': 'Possédé',
        'skins.notEnoughCoins': 'Pièces insuffisantes',
        'skins.getExtraCoins': 'Gagnez des pièces supplémentaires !',
        'skins.watchAd': 'Voir la pub',
        'skins.watchAdSub': 'Regardez une courte vidéo et obtenez des pièces supplémentaires.',
        'skins.classic': 'Dyno Classique',
        'skins.earth': 'Dyno Terrestre',
        'skins.ice': 'Dyno Saphir',
        'skins.lava': 'Dyno Émeraude',
        'skins.forest': 'Dyno Sismique',
        'skins.shadow': 'Dyno Blizzard',
        'skins.gold': 'Dyno Fantastique',
    },

    tr: {
        // Loading screen
        loading_title: 'Yükleniyor',
        loading_status: 'Bölüm hazırlanıyor...',
        loading_detail: 'Lütfen bekleyin',
        loading_phase: 'Yükleniyor',
        loading_preview_label: 'Ejderha yükleniyor',
        loading_preview_ready: 'Ejderha hazır',
        loading_failed_status: 'Yükleme başarısız.',
        loading_error_phase: 'Hata',

        // Game over
        game_over_title: 'Oyun Bitti',
        game_over_retry: 'Tekrar Dene',
        game_over_revive: 'Canlan',

        // Settings
        settings_title: 'Ayarlar',
        settings_close_label: 'Ayarları kapat',
        settings_sfx: 'SFX',
        settings_sfx_label: 'Ses efektleri',
        settings_ambience: 'Ortam',
        settings_ambience_label: 'Ortam sesleri',
        settings_music: 'Müzik',
        settings_music_label: 'Müzik',
        settings_your_name: 'Adın',
        settings_quality: 'Kalite',
        settings_quality_label: 'Grafik kalitesi',
        settings_quality_auto: 'Otomatik',
        settings_quality_high: 'Yüksek',
        settings_quality_low: 'Düşük',
        settings_fullscreen: 'Tam ekran',
        settings_fullscreen_label: 'Masaüstü tam ekranını değiştir',
        settings_language: 'Dil',
        settings_quit: 'Oyundan çık',
        settings_quit_btn: 'Çık',
        settings_restart_missions: 'Görevleri yeniden başlat',
        settings_restart_btn: 'Yeniden başlat',
        settings_restart_confirm: 'Emin misin?',
        settings_reset_all: 'Tüm verileri sıfırla',
        settings_reset_all_btn: 'Hepsini sıfırla',
        loading_go: 'BAŞLA',
        loading_ready_detail: 'Bölümü başlatmak için BAŞLA\'ya bas',
        loading_ready_phase: 'Hazır',

        // Cinematic overlay
        cinematic_skip: 'Atla',

        // Dyno Fury HUD
        fury_label: 'ÖFKE',
        fury_ready: 'ÖFKE HAZIR',
        'rage.ready': 'ÖFKE HAZIR',

        // Keyboard key labels
        key_fire: 'BOŞLUK',
        key_speed: 'SHIFT',

        // Mission dialog — start/complete
        mission_default_title: 'GÖREV',
        mission_go: 'GİT',
        mission_failed_title: 'GÖREV BAŞARISIZ',
        mission_retry: 'TEKRAR DENE',
        mission_continue: 'DEVAM ET',
        mission_complete_suffix: 'tamamlandı',
        mission_failed_suffix: 'başarısız',
        mission_timeout_prefix: 'Süren doldu:',

        // Mission dialog — cancel
        mission_abandon_title: 'GÖREVİ BIRAK?',
        mission_abandon_named: (title) => `"${title}" iptal edilsin ve yeni görev başlasın mı?`,
        mission_abandon_generic: 'Mevcut görev iptal edilsin ve yeni bir tane başlasın mı?',
        mission_yes: 'EVET',
        mission_no: 'HAYIR',

        // Mission dialog — leaderboard
        mission_your_name: 'ADIN',
        mission_your_time: 'SÜRENİZ',
        mission_your_best_times: 'EN İYİ SÜRELERİN',
        mission_global_top: 'GLOBAL İLK 100',
        mission_new_record: 'YENİ',

        // Active mission UI
        race_ring: (index, total) => `Halka ${index}/${total}`,

        // Mission data
        mission_000_title: 'GÖREV',
        mission_000_description: 'Heykeli kaidesine geri koy',
        mission_000_callout: 'Heykeli geri getir!',
        mission_000_objects_fail: 'Bu görevi tamamlamak için seviyede yeterli heykel yok.',

        mission_001_title: 'GÖREV',
        mission_001_description: 'En yüksek ağacın tepesine uç',
        mission_001_callout: 'Ağacın tepesine uç!',

        mission_003_title: 'GÖREV',
        mission_003_description: 'Bir arabayı çatıya koy',
        mission_003_objects_fail: 'Bu görevi tamamlamak için seviyede yeterli araba yok.',
        mission_003_callout: 'Bir arabayı çatıya koy!',

        mission_race_01_title: 'YARIŞ',
        mission_race_01_description: 'Tüm halkalardan olabildiğince hızlı geç!',
        mission_race_01_callout: 'Halkalardan geç!',

        mission_race_02_title: 'YARIŞ',
        mission_race_02_description: 'Tüm halkalardan olabildiğince hızlı geç!',
        mission_race_02_callout: 'Halkalardan geç!',

        mission_race_03_title: 'YARIŞ',
        mission_race_03_description: 'Tüm halkalardan olabildiğince hızlı geç!',
        mission_race_03_callout: 'Halkalardan geç!',
        
        mission_destroy_tanks_01_title: 'GÖREV',
        mission_destroy_tanks_01_description: '2 tankı olabildiğince hızlı yok et!',
        mission_destroy_tanks_01_callout: '2 tankı yok et!',
        mission_destroy_planes_01_title: 'GÖREV',
        mission_destroy_planes_01_description: '2 uçağı olabildiğince hızlı yok et!',
        mission_destroy_planes_01_callout: '2 uçağı yok et!',

        mission_statues_title: 'GİZLİ GÖREV',
        mission_statues_description: 'Heykelleri onar!',

        mission_shark_title: 'GÖREV',
        mission_shark_description: 'Bir köpekbalığını köpekbalığı tankına koy!',

        // Dyno Skin Shop
        'skins.title': 'Ejderha Kostümleri',
        'skins.close': 'Mağazayı kapat',
        'skins.prev': 'Önceki kostüm',
        'skins.next': 'Sonraki kostüm',
        'skins.buy': 'Satın Al',
        'skins.equip': 'Giy',
        'skins.equipped': 'Giyildi',
        'skins.owned': 'Sahip',
        'skins.notEnoughCoins': 'Yeterli madeni para yok',
        'skins.getExtraCoins': 'Ekstra madeni para kazan!',
        'skins.watchAd': 'Reklam İzle',
        'skins.watchAdSub': 'Kısa bir video izle ve ekstra madeni para kazan.',
        'skins.classic': 'Klasik Ejderha',
        'skins.earth': 'Toprak Ejderha',
        'skins.ice': 'Safir Ejderha',
        'skins.lava': 'Zümrüt Ejderha',
        'skins.forest': 'Sismik Ejderha',
        'skins.shadow': 'Tipi Ejderha',
        'skins.gold': 'Fantezi Ejderha',
    },

    ru: {
        // Loading screen
        loading_title: 'Загрузка',
        loading_status: 'Подготовка уровня...',
        loading_detail: 'Пожалуйста, подождите',
        loading_phase: 'Загрузка',
        loading_preview_label: 'Загрузка дракона',
        loading_preview_ready: 'Дракон готов',
        loading_failed_status: 'Ошибка загрузки.',
        loading_error_phase: 'Ошибка',

        // Game over
        game_over_title: 'Game Over',
        game_over_retry: 'Повторить',
        game_over_revive: 'Возродиться',

        // Settings
        settings_title: 'Настройки',
        settings_close_label: 'Закрыть настройки',
        settings_sfx: 'SFX',
        settings_sfx_label: 'Звуковые эффекты',
        settings_ambience: 'Фон',
        settings_ambience_label: 'Фоновые звуки',
        settings_music: 'Музыка',
        settings_music_label: 'Музыка',
        settings_your_name: 'Твоё имя',
        settings_quality: 'Качество',
        settings_quality_label: 'Качество графики',
        settings_quality_auto: 'Авто',
        settings_quality_high: 'Высокое',
        settings_quality_low: 'Низкое',
        settings_fullscreen: 'Полный экран',
        settings_fullscreen_label: 'Переключить полноэкранный режим рабочего стола',
        settings_language: 'Язык',
        settings_quit: 'Выйти из игры',
        settings_quit_btn: 'Выйти',
        settings_restart_missions: 'Перезапустить миссии',
        settings_restart_btn: 'Перезапустить',
        settings_restart_confirm: 'Ты уверен?',
        settings_reset_all: 'Удалить все данные',
        settings_reset_all_btn: 'Удалить всё',
        loading_go: 'ВПЕРЁД',
        loading_ready_detail: 'Нажмите ВПЕРЁД чтобы начать уровень',
        loading_ready_phase: 'Готово',

        // Cinematic overlay
        cinematic_skip: 'Пропустить',

        // Dyno Fury HUD
        fury_label: 'ЯРОСТЬ',
        fury_ready: 'ЯРОСТЬ ГОТОВА',
        'rage.ready': 'ЯРОСТЬ ГОТОВА',

        // Keyboard key labels
        key_fire: 'ПРОБЕЛ',
        key_speed: 'SHIFT',

        // Mission dialog — start/complete
        mission_default_title: 'МИССИЯ',
        mission_go: 'ВПЕРЁД',
        mission_failed_title: 'МИССИЯ ПРОВАЛЕНА',
        mission_retry: 'ПОВТОРИТЬ',
        mission_continue: 'ПРОДОЛЖИТЬ',
        mission_complete_suffix: 'выполнена',
        mission_failed_suffix: 'провалена',
        mission_timeout_prefix: 'Время вышло для',

        // Mission dialog — cancel
        mission_abandon_title: 'БРОСИТЬ МИССИЮ?',
        mission_abandon_named: (title) => `Отменить «${title}» и начать новую миссию?`,
        mission_abandon_generic: 'Отменить текущую миссию и начать новую?',
        mission_yes: 'ДА',
        mission_no: 'НЕТ',

        // Mission dialog — leaderboard
        mission_your_name: 'ТВОЁ ИМЯ',
        mission_your_time: 'ТВОЁ ВРЕМЯ',
        mission_your_best_times: 'ТВОИ ЛУЧШИЕ ВРЕМЕНА',
        mission_global_top: 'МИРОВОЙ ТОП 100',
        mission_new_record: 'НОВЫЙ',

        // Active mission UI
        race_ring: (index, total) => `Кольцо ${index}/${total}`,

        // Mission data
        mission_000_title: 'МИССИЯ',
        mission_000_description: 'Верни статую на пьедестал',
        mission_000_callout: 'Верни статую!',
        mission_000_objects_fail: 'Недостаточно статуй на уровне для выполнения этой миссии.',

        mission_001_title: 'МИССИЯ',
        mission_001_description: 'Долети до верхушки самого высокого дерева',
        mission_001_callout: 'Долети до верхушки дерева!',

        mission_003_title: 'МИССИЯ',
        mission_003_description: 'Поставь одну машину на крышу',
        mission_003_objects_fail: 'Недостаточно машин на уровне для выполнения этой миссии.',
        mission_003_callout: 'Поставь машину на крышу!',

        mission_race_01_title: 'ГОНКА',
        mission_race_01_description: 'Пролети сквозь все кольца как можно быстрее!',
        mission_race_01_callout: 'Мчись сквозь кольца!',

        mission_race_02_title: 'ГОНКА',
        mission_race_02_description: 'Пролети сквозь все кольца как можно быстрее!',
        mission_race_02_callout: 'Мчись сквозь кольца!',

        mission_race_03_title: 'ГОНКА',
        mission_race_03_description: 'Пролети сквозь все кольца как можно быстрее!',
        mission_race_03_callout: 'Мчись сквозь кольца!',
        
        mission_destroy_tanks_01_title: 'МИССИЯ',
        mission_destroy_tanks_01_description: 'Уничтожь 2 танка как можно быстрее!',
        mission_destroy_tanks_01_callout: 'Уничтожь 2 танка!',
        mission_destroy_planes_01_title: 'МИССИЯ',
        mission_destroy_planes_01_description: 'Уничтожь 2 самолёта как можно быстрее!',
        mission_destroy_planes_01_callout: 'Уничтожь 2 самолёта!',

        mission_statues_title: 'СКРЫТАЯ МИССИЯ',
        mission_statues_description: 'Восстанови статуи!',

        mission_shark_title: 'МИССИЯ',
        mission_shark_description: 'Помести акулу в акуловый бассейн!',

        // Dyno Skin Shop
        'skins.title': 'Скины Дракона',
        'skins.close': 'Закрыть магазин',
        'skins.prev': 'Предыдущий скин',
        'skins.next': 'Следующий скин',
        'skins.buy': 'Купить',
        'skins.equip': 'Надеть',
        'skins.equipped': 'Надет',
        'skins.owned': 'Куплен',
        'skins.notEnoughCoins': 'Недостаточно монет',
        'skins.getExtraCoins': 'Получи дополнительные монеты!',
        'skins.watchAd': 'Смотреть рекламу',
        'skins.watchAdSub': 'Посмотри короткое видео и получи дополнительные монеты.',
        'skins.classic': 'Классический Дракон',
        'skins.earth': 'Земляной Дракон',
        'skins.ice': 'Сапфировый Дракон',
        'skins.lava': 'Изумрудный Дракон',
        'skins.forest': 'Сейсмический Дракон',
        'skins.shadow': 'Дракон Метели',
        'skins.gold': 'Фантазийный Дракон',
    },
};

const SUPPORTED_LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'nl', label: 'Nederlands' },
    { code: 'de', label: 'Deutsch' },
    { code: 'fr', label: 'Français' },
    { code: 'es', label: 'Español' },
    { code: 'pt', label: 'Português (Brasil)' },
    { code: 'tr', label: 'Türkçe' },
    { code: 'ru', label: 'Русский' },
];

function detectLanguage() {
    // Check stored preference first.
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && LOCALES[stored]) return stored;
    } catch {
        // Storage unavailable.
    }

    // Auto-detect from browser.
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
    for (const lang of langs) {
        const code = lang.split('-')[0].toLowerCase();
        if (LOCALES[code]) return code;
    }

    return 'en';
}

let currentLanguage = detectLanguage();

export function getLanguage() {
    return currentLanguage;
}

export function setLanguage(code) {
    if (!LOCALES[code]) return;
    currentLanguage = code;
    try {
        localStorage.setItem(STORAGE_KEY, code);
    } catch {
        // Storage unavailable.
    }
    window.dispatchEvent(new CustomEvent('languagechange', { detail: { language: code } }));
}

export function getSupportedLanguages() {
    return SUPPORTED_LANGUAGES;
}

/**
 * Translate a key. If the value is a function, call it with the provided args.
 * Falls back to English if the key is missing in the current locale.
 */
export function t(key, ...args) {
    const locale = LOCALES[currentLanguage] ?? LOCALES.en;
    const value = locale[key] ?? LOCALES.en[key];
    if (value === undefined) return key;
    if (typeof value === 'function') return value(...args);
    return value;
}
