/** Original, headless 0.9a conversation engine. Saves only validated IDs, no player text. */
import {getPerspective} from './social-perspective.js';
import {charismaSocialBonus,HOBBY_SKILLS,CHARISMA_SKILL_ID} from './hobby-reading.js';
import {currentSkillLevel} from './skills-engine.js';
import {isWalkable,isClearLine} from './navigation.js';
import {episodeContext,getPair,getDirectedView} from './social-graph.js';
import {boundaryDisposition,cueConversationBias} from './social-boundaries.js';
import {socialCompatibility,CONVERSATION_DISCOVERY_TAGS,knownPreferences} from './social-compatibility.js';
import {evaluateSocialReaction} from './social-reactions.js';
import {emitSocialReaction,socialOutcome} from './social-feedback.js';

const row=(label,opener,tag,lines)=>Object.freeze({label,opener,tag,lines:Object.freeze(lines)});
const saying=(label,line,yes,no,tone,weight)=>Object.freeze({label,line,yes,no,tone,weight});
const legacyTopics=Object.freeze({
  daily:row('Как проходит день','Как у тебя сегодня дела?','calm_leisure',['daily.listen','daily.news','daily.critic']),
  hobbies:row('Увлечения','Чем бы тебе хотелось заняться?','music',['hobbies.music','hobbies.books','hobbies.mock']),
  humor:row('Юмор','У меня для тебя одна забавная история.','games',['humor.joke','humor.story','humor.tease']),
  support:row('Поддержка','Кажется, у тебя сегодня непростой день.','socializing',['support.listen','support.help','support.dismiss']),
  plans:row('Планы','О чём мечтаешь на ближайшие дни?','drawing',['plans.idea','plans.invite','plans.doubt']),
  conflict:row('Разобраться','Между нами осталось что-то недосказанное.','socializing',['conflict.apologize','conflict.explain','conflict.blame']),
  sports:row('Обсудить матч','Как тебе последний матч Лиги Блин’С?','games',['sports.result','sports.cheer','sports.debate'])
});
const legacyActs=Object.freeze({
  'daily.listen':saying('Спросить о настроении','Мне важно знать, как ты себя чувствуешь.','Спасибо, что интересуешься.','Не хочу об этом говорить.','warm',3),
  'daily.news':saying('Поделиться новостью','Сегодня было кое-что интересное!','Расскажи поподробнее.','Сейчас мне не до новостей.','neutral',2),
  'daily.critic':saying('Пожаловаться на день','Опять всё пошло не по плану.','Да, иногда бывает непросто.','Пожалуйста, не вымещай это на мне.','sharp',-2),
  'hobbies.music':saying('Поговорить о музыке','Что из музыки тебя сейчас радует?','Мне нравится делиться любимой музыкой.','Я лучше послушаю в одиночестве.','warm',3),
  'hobbies.books':saying('Обсудить книги','Есть интересная история, которую ты читал(а)?','Люблю необычные истории.','Мне сейчас не до книг.','neutral',2),
  'hobbies.mock':saying('Поддеть за увлечение','Серьёзно? Ты тратишь время на это?','Ты, наверное, шутишь?','Не высмеивай мои интересы.','sharp',-3),
  'humor.joke':saying('Пошутить','Мой чай сегодня пытался сбежать со стола!','Ха, это было бы зрелище!','Мне сейчас совсем не до шуток.','warm',3),
  'humor.story':saying('Рассказать историю','Вчера мне приснилась маленькая вселенная.','И что было дальше?','Мне не хочется сейчас слушать истории.','neutral',2),
  'humor.tease':saying('Съязвить','Ну ты и мастер приключений на ровном месте!','Ладно, это было забавно.','Не стоит шутить за мой счёт.','sharp',-2),
  'support.listen':saying('Выслушать','Если хочешь, расскажи — я выслушаю.','Мне легче, когда ты рядом.','Я пока побуду наедине с собой.','warm',4),
  'support.help':saying('Предложить помощь','Давай попробуем решить это вместе.','Спасибо, давай попробуем.','Мне нужно справиться самостоятельно.','neutral',3),
  'support.dismiss':saying('Обесценить проблему','Зачем так переживать из-за мелочей?','Может, ты и прав(а), но это сложно.','Ты совсем меня не слышишь.','sharp',-4),
  'plans.idea':saying('Предложить идею','Может, устроим что-нибудь новое дома?','Звучит интересно.','Мне не до новых затей.','warm',3),
  'plans.invite':saying('Пригласить к планам','Было бы здорово придумать план вместе.','Я за, вдвоём веселее.','Я предпочту решать за себя.','neutral',3),
  'plans.doubt':saying('Усомниться в планах','Не думаю, что у тебя это получится.','Посмотрим, как пойдёт.','Почему ты в меня не веришь?','sharp',-3),
  'conflict.apologize':saying('Извиниться','Прости, если я тебя задел(а).','Спасибо, мне важно это услышать.','Пока мне сложно это принять.','warm',4),
  'conflict.explain':saying('Объяснить свою позицию','Хочу спокойно объяснить, почему так вышло.','Хорошо, попробуем понять друг друга.','Я ещё не готов(а) это обсуждать.','neutral',2),
  'conflict.blame':saying('Обвинить','Всё случилось из-за тебя!','Давай без обвинений.','Я не собираюсь слушать обвинения.','sharp',-5),
  'sports.result':saying('Обсудить матч','Этот матч получился интересным, правда?','Да, было что обсудить.','Я особо не следил(а), но расскажи.','neutral',2),
  'sports.cheer':saying('Порадоваться победе','Вот это был красивый момент!','Разделяю твой восторг.','Мне этот футбол не слишком интересен.','warm',3),
  'sports.debate':saying('Поспорить о счёте','Я бы по-другому оценил(а) этот матч.','Интересная точка зрения!','Давай не превращать это в ссору.','sharp',-1)
});
const expandedTopics=Object.freeze({
  memories:row("Детство и воспоминания","Какие мелочи могли бы напомнить о детстве?","calm_leisure",["memories.ask","memories.share","memories.tact","memories.reflect","memories.deep","memories.yes","memories.repair"]),
  career:row("Работа и карьера","Как ты относишься к работе и профессиональным целям?","socializing",["career.ask","career.share","career.tact","career.reflect","career.deep","career.yes","career.repair"]),
  dreams:row("Мечты","Представим, чего можно захотеть в будущем.","drawing",["dreams.ask","dreams.share","dreams.tact","dreams.reflect","dreams.deep","dreams.yes","dreams.repair"]),
  money:row("Деньги и привычки","Поговорим о том, как разумно распоряжаться деньгами.","calm_leisure",["money.ask","money.share","money.tact","money.reflect","money.deep","money.yes","money.repair"]),
  family:row("Семья и близкие","Что помогает близким людям ладить друг с другом?","socializing",["family.ask","family.share","family.tact","family.reflect","family.deep","family.yes","family.repair"]),
  relationships:row("Дружба и отношения","Поговорим о том, что помогает людям понимать друг друга.","socializing",["relationships.ask","relationships.share","relationships.tact","relationships.reflect","relationships.deep","relationships.yes","relationships.repair"]),
  philosophy:row("Философия жизни","Интересно обсудить вопросы без единственно верного ответа.","calm_leisure",["philosophy.ask","philosophy.share","philosophy.tact","philosophy.reflect","philosophy.deep","philosophy.yes","philosophy.repair"]),
  gossip:row("Слухи и факты","Как отличить то, что мы знаем, от чужих домыслов?","socializing",["gossip.ask","gossip.share","gossip.tact","gossip.reflect","gossip.deep","gossip.yes","gossip.repair","gossip.musicLikes","gossip.musicDislikes","gossip.booksLikes","gossip.booksDislikes"])
});
const expandedActs=Object.freeze({
  "memories.ask":Object.freeze({...saying("Спросить о детских радостях","Что в детстве могло бы радовать больше всего?","Наверное, целый свободный день.","Не хочу возвращаться к детству.","warm",3),minLevel:0,branch:"any"}),
  "memories.share":Object.freeze({...saying("Представить старый двор","Представь двор, где всегда есть время для игры.","Интересно, что бы мы там придумали.","Мне ближе настоящее.","neutral",2),minLevel:0,branch:"any"}),
  "memories.tact":Object.freeze({...saying("Пошутить о каникулах","Детская мечта о бесконечных каникулах и сейчас заманчиво звучит.","Вот бы ещё без домашних заданий!","Не всем детство кажется беззаботным.","warm",3),minLevel:3,branch:"any"}),
  "memories.reflect":Object.freeze({...saying("Обсудить уроки прошлого","Какой совет взрослый мог бы дать себе в детстве?","Не сравнивать себя с другими.","Это слишком личное.","neutral",2),minLevel:6,branch:"any"}),
  "memories.deep":Object.freeze({...saying("Поговорить о прошлом без сожалений","Можно ценить прошлое, не пытаясь его повторить. Как думаешь?","Да, это помогает смотреть вперёд.","Я пока не готов к такому разговору.","neutral",2),minLevel:9,branch:"any"}),
  "memories.yes":Object.freeze({...saying("Развить приятное воспоминание","Что из такого ощущения хотелось бы вернуть в обычный день?","Больше времени без спешки.","Не хочется ничего возвращать.","warm",3),minLevel:0,branch:"accepted"}),
  "memories.repair":Object.freeze({...saying("Оставить прошлое в покое","Не будем ворошить прошлое. Мне интересно, как тебе сегодня.","Спасибо, так комфортнее.","Мне нужно немного тишины.","warm",3),minLevel:0,branch:"refused"}),
  "career.ask":Object.freeze({...saying("Выслушать о работе","Что для тебя самое трудное в рабочих делах?","Иногда трудно понять, с чего начать.","Сейчас не хочется говорить о работе.","warm",3),minLevel:0,branch:"any"}),
  "career.share":Object.freeze({...saying("Обсудить отдых","Как лучше переключаться после напряжённого рабочего дня?","Мне помогает сменить обстановку.","Работа и так занимает слишком много места.","neutral",2),minLevel:0,branch:"any"}),
  "career.tact":Object.freeze({...saying("Разрядить рабочее напряжение","Иногда самый важный коллега — чашка чая, которая ничего не требует.","У такой коллеги прекрасный характер!","Шутки сейчас не помогают.","warm",3),minLevel:3,branch:"any"}),
  "career.reflect":Object.freeze({...saying("Разобрать трудность по шагам","Если разделить сложную задачу на маленькие, какой шаг будет первым?","Так проблема уже кажется посильной.","Не хочу превращать беседу в совещание.","neutral",2),minLevel:6,branch:"any"}),
  "career.deep":Object.freeze({...saying("Вдохновить на профессиональный рост","Что бы ты попробовал в работе, если бы не боялся ошибиться?","Есть над чем подумать. Возможно, стоит рискнуть.","Мне не нужна мотивационная речь.","neutral",2),minLevel:9,branch:"any"}),
  "career.yes":Object.freeze({...saying("Поддержать выбранный подход","Что ещё могло бы помочь справиться с рабочими трудностями?","Наверное, больше времени на себя.","Давай не будем углубляться.","warm",3),minLevel:0,branch:"accepted"}),
  "career.repair":Object.freeze({...saying("Отложить рабочие разговоры","Дома необязательно обсуждать работу. Оставим её за дверью.","Вот это мне сейчас нужно.","Хочу просто побыть в тишине.","warm",3),minLevel:0,branch:"refused"}),
  "dreams.ask":Object.freeze({...saying("Спросить о мечте","Если бы было свободное время, чему хотелось бы его посвятить?","Попробовать что-нибудь совсем новое.","Я пока об этом не думал.","warm",3),minLevel:0,branch:"any"}),
  "dreams.share":Object.freeze({...saying("Помечтать о путешествии","Представь, что можно выбрать любое место для отдыха.","Я бы выбрал место без суеты.","Мне нравится оставаться дома.","neutral",2),minLevel:0,branch:"any"}),
  "dreams.tact":Object.freeze({...saying("Поддержать воображение","Даже у необычной мечты есть преимущество: скучно точно не будет.","Тогда можно мечтать смелее!","Не хочу превращать это в игру.","warm",3),minLevel:3,branch:"any"}),
  "dreams.reflect":Object.freeze({...saying("Найти первый шаг","Что из желаемого можно начать делать уже на этой неделе?","Небольшой шаг звучит реально.","Не хочу сейчас ничего планировать.","neutral",2),minLevel:6,branch:"any"}),
  "dreams.deep":Object.freeze({...saying("Обсудить смысл мечты","Что важнее в мечте: результат или то, кем ты станешь по пути?","Пожалуй, важен и сам путь.","Не хочется анализировать свои желания.","neutral",2),minLevel:9,branch:"any"}),
  "dreams.yes":Object.freeze({...saying("Развить идею","Какая часть этой идеи тебе нравится больше всего?","Возможность самому выбирать.","Давай оставим это просто мечтой.","warm",3),minLevel:0,branch:"accepted"}),
  "dreams.repair":Object.freeze({...saying("Не торопить с планами","Не обязательно знать будущее. Можно наслаждаться сегодняшним днём.","Да, это снимает напряжение.","Мне хочется сменить тему.","warm",3),minLevel:0,branch:"refused"}),
  "money.ask":Object.freeze({...saying("Обсудить покупки","Что тебе важнее при покупке: цена или качество?","Скорее хороший баланс.","Не хочу обсуждать деньги.","warm",3),minLevel:0,branch:"any"}),
  "money.share":Object.freeze({...saying("Поговорить о накоплениях","Полезнее откладывать понемногу или ждать большой суммы?","Маленькие шаги выглядят надёжнее.","У каждого свои обстоятельства.","neutral",2),minLevel:0,branch:"any"}),
  "money.tact":Object.freeze({...saying("Пошутить о списке покупок","Список покупок иногда считает себя списком желаний.","Главное, чтобы кошелёк не узнал!","Деньги для меня не повод для шуток.","warm",3),minLevel:3,branch:"any"}),
  "money.reflect":Object.freeze({...saying("Найти компромисс в расходах","Можно выделить немного на удовольствие и остальное на важное. Как тебе такой принцип?","Звучит разумно, без крайностей.","Не хочу советов о том, как тратить.","neutral",2),minLevel:6,branch:"any"}),
  "money.deep":Object.freeze({...saying("Обсудить ценность свободы","Что значит финансовая свобода, если не измерять её суммой?","Возможность не бояться каждого решения.","Это слишком личная тема.","neutral",2),minLevel:9,branch:"any"}),
  "money.yes":Object.freeze({...saying("Уточнить приоритеты","Какие расходы ты считаешь действительно стоящими?","Те, что делают жизнь удобнее.","Не хочу разбирать свои траты.","warm",3),minLevel:0,branch:"accepted"}),
  "money.repair":Object.freeze({...saying("Уважить личный бюджет","Не буду спрашивать о твоих деньгах. Это личное дело.","Спасибо за понимание.","Давай закончим этот разговор.","warm",3),minLevel:0,branch:"refused"}),
  "family.ask":Object.freeze({...saying("Спросить о традициях","Какая семейная традиция могла бы делать дом уютнее?","Совместный ужин без спешки.","Мне не хочется говорить о семье.","warm",3),minLevel:0,branch:"any"}),
  "family.share":Object.freeze({...saying("Обсудить домашние обязанности","Как лучше делить домашние дела, чтобы никому не было обидно?","Договориться заранее было бы полезно.","У каждого свой способ.","neutral",2),minLevel:0,branch:"any"}),
  "family.tact":Object.freeze({...saying("Пошутить о домашнем уюте","Иногда самый семейный спор — кто оставил последнюю крошку на столе.","У крошки наверняка есть алиби!","Не люблю шутки о домашних ссорах.","warm",3),minLevel:3,branch:"any"}),
  "family.reflect":Object.freeze({...saying("Обсудить разные потребности","Как сохранить близость, если каждому нужно своё пространство?","Наверное, стоит говорить об этом прямо.","Не хочу обсуждать это.","neutral",2),minLevel:6,branch:"any"}),
  "family.deep":Object.freeze({...saying("Поговорить о доверии дома","Что делает дом местом, где можно быть собой?","Когда не приходится оправдываться.","Не хочу открываться на эту тему.","neutral",2),minLevel:9,branch:"any"}),
  "family.yes":Object.freeze({...saying("Предложить идею традиции","Может, иногда устраивать вечер без спешки и дел?","Такая традиция мне нравится.","Я не хочу связывать себя планами.","warm",3),minLevel:0,branch:"accepted"}),
  "family.repair":Object.freeze({...saying("Не расспрашивать о близких","Не будем обсуждать личную жизнь семьи без желания.","Спасибо, это уважительно.","Мне лучше сменить тему.","warm",3),minLevel:0,branch:"refused"}),
  "relationships.ask":Object.freeze({...saying("Спросить о дружбе","Что ты особенно ценишь в хорошем друге?","Когда можно говорить без осуждения.","Не хочется обсуждать личное.","warm",3),minLevel:0,branch:"any"}),
  "relationships.share":Object.freeze({...saying("Обсудить общение","Обязательно ли близким людям иметь одинаковые интересы?","Нет, различия тоже интересны.","Не хочется рассуждать об этом.","neutral",2),minLevel:0,branch:"any"}),
  "relationships.tact":Object.freeze({...saying("Отметить внимательность","Приятно, что мы можем обсуждать разные взгляды, а не только соглашаться.","Это приятно слышать.","Не надо делать поспешных выводов.","warm",3),minLevel:3,branch:"any"}),
  "relationships.reflect":Object.freeze({...saying("Обсудить границы","Как лучше сказать человеку, что тебе нужно немного пространства?","Спокойно и без обвинений.","Не хочу говорить о границах сейчас.","neutral",2),minLevel:6,branch:"any"}),
  "relationships.deep":Object.freeze({...saying("Поговорить о доверии","Можно ли доверять человеку и всё же не соглашаться с ним?","Думаю, это даже признак доверия.","Я пока не готов к такому разговору.","neutral",2),minLevel:9,branch:"any"}),
  "relationships.yes":Object.freeze({...saying("Уточнить ценности дружбы","Что помогает сохранить уважение, когда мнения расходятся?","Умение дослушать до конца.","Не хочу продолжать эту тему.","warm",3),minLevel:0,branch:"accepted"}),
  "relationships.repair":Object.freeze({...saying("Уважить дистанцию","Не будем углубляться. У каждого есть право на личные темы.","Спасибо, это важно.","Мне хочется закончить.","warm",3),minLevel:0,branch:"refused"}),
  "philosophy.ask":Object.freeze({...saying("Спросить о хорошем дне","Что делает день удачным, даже если ничего особенного не произошло?","Ощущение спокойствия вполне достаточно.","Не люблю абстрактные вопросы.","warm",3),minLevel:0,branch:"any"}),
  "philosophy.share":Object.freeze({...saying("Обсудить случайности","В жизни больше зависит от выбора или от случая?","Наверное, они постоянно переплетаются.","Не хочется об этом спорить.","neutral",2),minLevel:0,branch:"any"}),
  "philosophy.tact":Object.freeze({...saying("Пошутить о мудрости","Может, мудрость начинается с признания, что чай уже остыл?","Тогда у меня богатый жизненный опыт!","Не вижу смысла в шутке.","warm",3),minLevel:3,branch:"any"}),
  "philosophy.reflect":Object.freeze({...saying("Рассмотреть другую точку зрения","Можно ли считать ошибку полезной, если она помогла изменить решение?","Да, иногда это лучший урок.","Не хочу оправдывать ошибки.","neutral",2),minLevel:6,branch:"any"}),
  "philosophy.deep":Object.freeze({...saying("Обсудить смысл успеха","Если никто не оценивает твои достижения, по чему ты определяешь успех?","По ощущению, что делаю важное для себя.","Не готов формулировать это сейчас.","neutral",2),minLevel:9,branch:"any"}),
  "philosophy.yes":Object.freeze({...saying("Развить мысль","Как этот взгляд мог бы повлиять на обычный завтрашний день?","Возможно, я буду меньше спешить.","Давай не искать практического смысла.","warm",3),minLevel:0,branch:"accepted"}),
  "philosophy.repair":Object.freeze({...saying("Оставить вопрос открытым","Не обязательно приходить к одному ответу. Пусть каждый сохранит своё мнение.","С этим я согласен.","Давай поговорим о другом.","warm",3),minLevel:0,branch:"refused"}),
  "gossip.ask":Object.freeze({...saying("Обсудить проверку слухов","Если кто-то расскажет новость о знакомом, как понять, что она верна?","Лучше спросить самого человека.","Не люблю обсуждать слухи.","warm",3),minLevel:0,branch:"any"}),
  "gossip.share":Object.freeze({...saying("Отделить факт от мнения","Мы сейчас разговариваем — это факт. А мысли друг друга можем только уточнять.","Хорошее различие.","Не хочу разбирать каждое слово.","neutral",2),minLevel:0,branch:"any"}),
  "gossip.tact":Object.freeze({...saying("Пошутить об испорченном телефоне","Чем длиннее цепочка пересказов, тем больше шансов у истории стать сказкой.","Особенно если у сказки вырастут крылья!","Лучше ничего не пересказывать.","warm",3),minLevel:3,branch:"any"}),
  "gossip.reflect":Object.freeze({...saying("Обсудить честный пересказ","Как пересказать чужие слова, не приписывая человеку лишнего?","Отделить услышанное от своих выводов.","Я бы просто не пересказывал.","neutral",2),minLevel:6,branch:"any"}),
  "gossip.deep":Object.freeze({...saying("Поговорить об ответственности за слухи","Стоит ли отказаться от интересной истории, если она может несправедливо навредить?","Да, интерес не оправдывает вред.","Не хочу обсуждать моральные дилеммы.","neutral",2),minLevel:9,branch:"any"}),
  "gossip.yes":Object.freeze({...saying("Поддержать осторожность","Лучше оставить неизвестное неизвестным, пока нет подтверждения?","Да, это честнее.","Давай не будем продолжать.","warm",3),minLevel:0,branch:"accepted"}),
  "gossip.repair":Object.freeze({...saying("Отказаться от пересудов","Не будем обсуждать отсутствующих. Поговорим о том, что происходит здесь.","Спасибо, так лучше.","Я хочу закончить беседу.","warm",3),minLevel:0,branch:"refused"}),
  "gossip.musicLikes":Object.freeze({...saying("Рассказать о любви знакомого к музыке","Я узнал, что одному из наших знакомых нравится музыка. Может, в следующий раз поговорим о любимых мелодиях?","Хорошая идея, это повод узнать человека лучше.","Не хочется обсуждать чужие вкусы.","neutral",2),minLevel:0,branch:"any",evidence:Object.freeze({tag:"music",stance:"likes"})}),
  "gossip.musicDislikes":Object.freeze({...saying("Рассказать о нелюбви знакомого к музыке","Один из наших знакомых, как выяснилось, не любит музыку. Лучше не навязывать ему прослушивание.","Да, стоит учитывать разные вкусы.","Думаю, это лучше обсудить с самим человеком.","neutral",2),minLevel:0,branch:"any",evidence:Object.freeze({tag:"music",stance:"dislikes"})}),
  "gossip.booksLikes":Object.freeze({...saying("Рассказать о любви знакомого к книгам","Мне стало известно, что один из наших знакомых любит книги. Можно будет поговорить с ним об интересных историях.","Это хороший повод для беседы.","Я предпочитаю узнавать людей напрямую.","neutral",2),minLevel:0,branch:"any",evidence:Object.freeze({tag:"books",stance:"likes"})}),
  "gossip.booksDislikes":Object.freeze({...saying("Рассказать о нелюбви знакомого к книгам","Я узнал, что одному из наших знакомых книги не по душе. Не стоит считать чтение универсальным увлечением.","Верно, у каждого свои интересы.","Не хочу обсуждать отсутствующих.","neutral",2),minLevel:0,branch:"any",evidence:Object.freeze({tag:"books",stance:"dislikes"})}),
  "daily.yes":Object.freeze({...saying("Уточнить приятный момент","Что сегодня оказалось лучше, чем ожидалось?","Даже маленькая удача поднимает настроение.","Не хочется подводить итоги.","warm",3),minLevel:0,branch:"accepted"}),
  "daily.repair":Object.freeze({...saying("Сменить тон разговора","Прости, не буду давить. Можно просто поболтать.","Так мне спокойнее.","Мне нужно побыть одному.","warm",3),minLevel:0,branch:"refused"}),
  "daily.extra":Object.freeze({...saying("Обсудить вечер","Как лучше провести оставшуюся часть дня?","Без лишней спешки.","Я пока не хочу строить планы.","neutral",2),minLevel:0,branch:"any"}),
  "hobbies.yes":Object.freeze({...saying("Спросить о творческом процессе","Что больше нравится: осваивать новое или совершенствовать знакомое?","Мне нравится видеть свой прогресс.","Не хочется сравнивать.","warm",3),minLevel:0,branch:"accepted"}),
  "hobbies.repair":Object.freeze({...saying("Уважить чужой вкус","У всех свои увлечения, не буду спорить о твоих.","Спасибо за понимание.","Я лучше займусь своим делом.","warm",3),minLevel:0,branch:"refused"}),
  "hobbies.extra":Object.freeze({...saying("Предложить новое хобби","Какое занятие стоило бы попробовать хотя бы раз?","Что-нибудь, где можно создать вещь руками.","Мне хватает привычных занятий.","neutral",2),minLevel:0,branch:"any"}),
  "humor.yes":Object.freeze({...saying("Продолжить игру воображения","А если бы чайник мог давать советы, что бы он сказал?","Не кипятись по пустякам!","Мне уже хватило шуток.","warm",3),minLevel:0,branch:"accepted"}),
  "humor.repair":Object.freeze({...saying("Извиниться за неудачную шутку","Прости, юмор оказался не к месту.","Спасибо, что заметил это.","Пока не хочется смеяться.","warm",3),minLevel:0,branch:"refused"}),
  "humor.extra":Object.freeze({...saying("Придумать забавный вопрос","Какое животное было бы худшим кассиром?","Осьминог — слишком много рук для сдачи.","Не хочется придумывать загадки.","neutral",2),minLevel:0,branch:"any"}),
  "support.yes":Object.freeze({...saying("Уточнить нужную помощь","Тебе сейчас полезнее совет или просто компания?","Наверное, просто компания.","Хочу разобраться самостоятельно.","warm",3),minLevel:0,branch:"accepted"}),
  "support.repair":Object.freeze({...saying("Дать пространство","Не буду настаивать. Если захочешь поговорить, я рядом.","Спасибо, мне это нужно.","Давай закончим.","warm",3),minLevel:0,branch:"refused"}),
  "support.extra":Object.freeze({...saying("Предложить передышку","Может, стоит ненадолго отвлечься от дел?","Да, передышка пригодится.","Я хочу сначала разобраться.","neutral",2),minLevel:0,branch:"any"}),
  "plans.yes":Object.freeze({...saying("Уточнить детали идеи","Что из этого плана хотелось бы сделать первым?","Начать с самого простого.","Пока рано решать.","warm",3),minLevel:0,branch:"accepted"}),
  "plans.repair":Object.freeze({...saying("Не навязывать планы","Не обязательно решать сейчас. Выберем время позже.","Так гораздо лучше.","Мне не хочется ничего обещать.","warm",3),minLevel:0,branch:"refused"}),
  "plans.extra":Object.freeze({...saying("Предложить запасной вариант","А если всё пойдёт иначе, какой вариант оставить про запас?","Хорошо иметь альтернативу.","Не люблю думать о неудачах.","neutral",2),minLevel:0,branch:"any"}),
  "conflict.yes":Object.freeze({...saying("Найти точку согласия","Что мы уже можем признать общим, даже если спорим?","Нам обоим хочется, чтобы стало спокойнее.","Пока не вижу общего.","warm",3),minLevel:0,branch:"accepted"}),
  "conflict.repair":Object.freeze({...saying("Предложить паузу","Не хочу усугублять спор. Вернёмся к нему, когда будем готовы.","Хорошо, мне нужна пауза.","Я пока не готов обсуждать даже это.","warm",3),minLevel:0,branch:"refused"}),
  "conflict.extra":Object.freeze({...saying("Отделить поступок от человека","Давай обсуждать конкретную ситуацию, а не характер друг друга.","Это справедливый подход.","Мне трудно говорить спокойно.","neutral",2),minLevel:0,branch:"any"}),
  "sports.yes":Object.freeze({...saying("Обсудить тактику","Что тебе интереснее: точная тактика или неожиданные моменты?","Неожиданности делают матч живым.","Не хочу разбирать игру.","warm",3),minLevel:0,branch:"accepted"}),
  "sports.repair":Object.freeze({...saying("Уважить разные команды","Не обязательно болеть за одну команду, чтобы нормально общаться.","Согласен, это всего лишь игра.","Давай без футбола.","warm",3),minLevel:0,branch:"refused"}),
  "sports.extra":Object.freeze({...saying("Обсудить атмосферу","Что делает просмотр матча интересным, кроме результата?","Атмосфера и ожидание гола.","Мне футбол не особенно интересен.","neutral",2),minLevel:0,branch:"any"})
});
export const CONVERSATION_TOPICS=Object.freeze({...Object.fromEntries(Object.entries(legacyTopics).map(([id,t])=>[id,row(t.label,t.opener,t.tag,[...t.lines,...Object.keys(expandedActs).filter(key=>key.startsWith(id+'.'))])])),...expandedTopics});
export const CONVERSATION_MAX_TURNS=3;
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const knownTopic=x=>typeof x==='string'&&Object.hasOwn(CONVERSATION_TOPICS,x);
const inTopic=(topic,id)=>knownTopic(topic)&&(CONVERSATION_TOPICS[topic].lines.includes(id)||(topic==='daily'&&Object.hasOwn(pilotActs,id)));
const pilotActs=Object.freeze({
  'daily.tact':{...saying('Подбодрить с юмором','Может, сегодняшний день просто репетирует завтрашний?','Хорошо сказано.','Мне сейчас не до юмора.','warm',3),minLevel:3},
  'daily.reframe':{...saying('Помочь взглянуть иначе','Что из сегодняшнего дня всё-таки получилось?','Об этом я не подумал(а).','Не хочу сейчас искать плюсы.','neutral',3),minLevel:6},
  'daily.inspire':{...saying('Вдохновить на перемены','Какой маленький шаг сделал бы завтра лучше?','Попробую об этом подумать.','Мне нужно решить это самостоятельно.','warm',3),minLevel:9}
});
export const CONVERSATION_ACTS=Object.freeze({...legacyActs,...pilotActs,...expandedActs});
const act=id=>CONVERSATION_ACTS[id];
const contribution=(id,accepted)=>accepted?Math.max(1,act(id).weight):-4;
export const activeConversationAction=root=>root?.socialAction?.conversation?root.socialAction:
  root?.additionalSocial?.conversation?root.additionalSocial:null;
export function conversationActor(root,id){
  if(id==='alex')return root;
  if(id==='mira')return root?.otherSim;
  if(typeof id!=='string'||!/^resident_(?:[3-9]|[1-9][0-9]{1,7})$/.test(id))return null;
  const p=root?.population,home=p?.linksByResident?.alex?.dwellingId;
  return home&&p?.linksByResident?.[id]?.dwellingId===home
    ?p.residentsById?.[id]?.actor||null:null;
}
/** Gossip may cite only a real preference already learned by the speaker
 * about a third co-resident acquainted with both participants. No profile
 * peek, fabricated rumor, or new relationship/knowledge reward. The static
 * historical utterance ID is sufficient to restore the transcript. */
function hasConversationEvidence(root,initiator,partner,evidence){
  if(!evidence)return true;
  if(!root||!initiator||!partner)return false;
  const graph=root.socialGraph;
  return (graph?.persons||[]).some(id=>{
    if(id===initiator||id===partner||!conversationActor(root,id))return false;
    const a=getPair(graph,initiator,id),b=getPair(graph,partner,id);
    if(!Number.isFinite(a?.metAt)||!Number.isFinite(b?.metAt))return false;
    return knownPreferences(a,initiator).some(k=>k.tag===evidence.tag&&
      k.stance===evidence.stance&&k.at<=root.minutes);
  });
}
const extraPair=(a,b)=>!['alex','mira'].includes(a)||!['alex','mira'].includes(b);
const tier=(root,id)=>currentSkillLevel(conversationActor(root,id)?.skills,HOBBY_SKILLS,CHARISMA_SKILL_ID);
const atHome=(root,id)=>!['departing','working','waiting','returning'].includes(root?.careerSystem?.byResident?.[id]?.currentShift?.phase);
function validLiveSession(root,s){
  if(!s||s.initiator===s.partner||!atHome(root,s.initiator)||!atHome(root,s.partner))return false;
  const a=conversationActor(root,s.initiator),b=conversationActor(root,s.partner);
  if(!a||!b||a.action||b.action)return false;
  if(s===root.additionalSocial){
    if(root.socialAction||!a.position||!b.position)return false;
    const d=Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z);
    if(d<.76||d>1.55||!isWalkable(a.position.x,a.position.z,root.world)||
      !isWalkable(b.position.x,b.position.z,root.world)||!isClearLine(a.position,b.position,root.world))return false;
  }
  return true;
}
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));

export function createConversation(topic){
  return knownTopic(topic)?{topic,phase:'opening',turns:[],score:0}:null;
}
export function restoreConversation(raw){
  if(!isRecord(raw)||!knownTopic(raw.topic)||!['opening','response','followUp'].includes(raw.phase)||
    !Array.isArray(raw.turns)||raw.turns.length>CONVERSATION_MAX_TURNS||
    !Number.isInteger(raw.score)||Math.abs(raw.score)>30)return null;
  const turns=[],seen=new Set();
  for(const turn of raw.turns){
    if(!isRecord(turn)||!inTopic(raw.topic,turn.id)||seen.has(turn.id)||
      typeof turn.accepted!=='boolean')return null;
    const branch=act(turn.id).branch;
    if(branch&&branch!=='any'&&(!turns.length||(branch==='accepted')!==turns.at(-1).accepted))return null;
    turns.push({id:turn.id,accepted:turn.accepted});seen.add(turn.id);
  }
  if((raw.phase==='opening'&&turns.length!==0)||
    (raw.phase==='response'&&turns.length===0)||
    (raw.phase==='followUp'&&(turns.length===0||turns.length>=CONVERSATION_MAX_TURNS)))return null;
  if(turns.reduce((sum,x)=>sum+contribution(x.id,x.accepted),0)!==raw.score)return null;
  return {topic:raw.topic,phase:raw.phase,turns,score:raw.score};
}
export function conversationOptions(session,root=null){
  if(!isRecord(session)||!knownTopic(session.topic)||
    !['opening','followUp'].includes(session.phase))return [];
  const used=new Set((session.turns||[]).map(x=>x.id));
  const action=activeConversationAction(root);
  let ids=[...CONVERSATION_TOPICS[session.topic].lines,
    ...(root&&session.topic==='daily'?Object.keys(pilotActs):[])].filter(id=>!used.has(id));
  const previous=session.turns?.at(-1);
  ids=ids.filter(id=>(!act(id).branch||act(id).branch==='any'||(previous&&(act(id).branch==='accepted')===previous.accepted))&&
    hasConversationEvidence(root,action?.initiator,action?.partner,act(id).evidence));
  if(previous){
    ids.sort((a,b)=>Number(act(b).branch&&act(b).branch!=='any')-Number(act(a).branch&&act(a).branch!=='any')||
      (!previous.accepted?Number(act(b).tone==='warm')-Number(act(a).tone==='warm'):0));
  }else if(session.topic==='daily'&&root){
    const priority=['daily.listen','daily.news','daily.tact','daily.reframe','daily.inspire'];
    ids.sort((a,b)=>(priority.includes(a)?priority.indexOf(a):99)-(priority.includes(b)?priority.indexOf(b):99));
  }
  return ids.map(id=>{
    const a=act(id),minLevel=a.minLevel||0;
    const skillLocked=tier(root,action?.initiator)<minLevel;
    const contextLocked=Boolean(previous&&!previous.accepted&&(['daily.tact','daily.inspire'].includes(id)||a.minLevel>=9));
    return {id,label:a.label,tone:a.tone,...(root?{minLevel,locked:skillLocked||contextLocked,
      lockReason:skillLocked?'Харизма '+minLevel:contextLocked?'Собеседник пока не готов':null}:{})};

  });
}
export function evaluateResponse(root,initiator,topic,id,partnerId=initiator==='alex'?'mira':initiator==='mira'?'alex':null,previous=null){
  if(!inTopic(topic,id)||initiator===partnerId)return null;
  const self=conversationActor(root,initiator),partner=conversationActor(root,partnerId);
  if(!self||!partner||!Number.isFinite(root?.minutes))return null;
  const a=act(id);
  if(!hasConversationEvidence(root,initiator,partnerId,a.evidence))return null;
  const reaction=evaluateSocialReaction({
    kind:'conversation',recipient:partner,view:extraPair(initiator,partnerId)
      ?getDirectedView(root.socialGraph,partnerId,initiator):getPerspective(root,partnerId),
    minutes:root.minutes,tag:CONVERSATION_DISCOVERY_TAGS[id]||CONVERSATION_TOPICS[topic].tag,
    tone:a.tone,weight:a.weight,
    historyBias:episodeContext(root.socialGraph,partnerId,initiator,root.minutes).bias,
    compatibilityBias:socialCompatibility(partner.personality,self.personality).bias,
    styleBias:boundaryDisposition(partner.personality,id)+
      cueConversationBias(getPair(root.socialGraph,initiator,partnerId),initiator,id)+
      (a.tone==='sharp'?0:charismaSocialBonus(self.skills))+
      (previous&&!previous.accepted&&a.tone==='sharp'?-2:0)+
      (a.branch==='refused'&&previous&&!previous.accepted?3:0)-(a.minLevel>=9&&a.branch==='any'?6:0)
  });
  return reaction?{accepted:reaction.accepted,confidence:reaction.confidence}:null;
}
/** No social event is applied before explicit completion of the conversation. */
export function chooseConversationTurn(root,id){
  const s=activeConversationAction(root),c=s?.conversation;
  if(root?.paused||s?.phase!=='using'||!c||!validLiveSession(root,s)||c.turns.length>=CONVERSATION_MAX_TURNS||!conversationOptions(c,root).some(x=>x.id===id&&!x.locked))return null;
  const reaction=evaluateResponse(root,s.initiator,c.topic,id,s.partner,c.turns.at(-1));
  if(!reaction)return null;
  c.turns.push({id,accepted:reaction.accepted});
  c.score+=contribution(id,reaction.accepted);
  c.phase='response';
  // A spoken reply really happened now; a queued invitation does not.
  emitSocialReaction(root,{
    actorId:s.initiator,responderId:s.partner,eventType:'conversation.line',
    outcome:socialOutcome({kind:'conversation',accepted:reaction.accepted,
      score:reaction.confidence,tone:act(id).tone}),
    intensity:Math.min(100,Math.max(30,Math.abs(reaction.confidence-50)*2))
  });
  return reaction;
}
export function continueConversation(root){
  const s=activeConversationAction(root),c=s?.conversation;
  if(root?.paused||s?.phase!=='using'||c?.phase!=='response'||!validLiveSession(root,s)||
    c.turns.length>=CONVERSATION_MAX_TURNS)return false;
  c.phase='followUp';
  return true;
}
export function conversationTranscript(c){
  if(!isRecord(c)||!knownTopic(c.topic)||!Array.isArray(c.turns))return [];
  const out=[{speaker:'initiator',line:CONVERSATION_TOPICS[c.topic].opener}];
  for(const t of c.turns.slice(0,CONVERSATION_MAX_TURNS)){
    if(!inTopic(c.topic,t.id)||typeof t.accepted!=='boolean')continue;
    const a=act(t.id);
    out.push({speaker:'initiator',line:a.line},{speaker:'partner',line:t.accepted?a.yes:a.no});
  }
  return out;
}
export function conversationOutcome(c){
  if(!isRecord(c)||!Array.isArray(c.turns)||!c.turns.length)return null;
  const score=clamp(c.score,-12,12);
  return {kind:score<0?'argue':'talk',score,label:score<0?'Разошлись во мнениях':
    score>=6?'Нашли общий язык':'Поговорили и узнали друг друга лучше'};
}
