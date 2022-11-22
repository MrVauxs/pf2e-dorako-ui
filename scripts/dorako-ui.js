/*
Hooks.on("init", async () => {
	game.settings.register("multi-roll", "hideNPCs", {
		scope: "world",
		config: true,
		name: "Hide non-Player Token Targets",
		hint: "Hides not owned by players tokens from the target list of a damage roll.",
		type: Boolean,
		default: false
	});
});
*/

const KEY = 'speaking-as';
const NAME = "Speaking As";
const CSS_PREFIX = `${KEY}--`;

const _log = (logFN, ...args) => {
	logFN.apply(console, [`%c${NAME}`, 'background-color: #4f0104; color: #fff; padding: 0.1em 0.5em;', ...args]);
};

const log = {
	dir: (label, ...args) => {
		const group = `${NAME} | ${label}`;
		console.group(group);
		console.dir(...args);
		console.groupEnd(group);
	},
	debug: (...args) => {
		_log(console.debug, ...args);
	},
	info: (...args) => {
		_log(console.info, ...args);
	},
	error: (...args) => {
		_log(console.error, ...args);
	},
};

function getThisSceneTokenObj(speaker) {
	let token = getTokenObj(speaker.token);
	if (!token) {
		token = getThisSceneTokenObjForActor(speaker.actor);
	}
	return token;
}

function getThisSceneTokenObjForActor(actorID) {
	let token = null;
	const scene = game.scenes.get(game.user.viewedScene);
	if (scene) {
		const thisSceneToken = scene.tokens.find((token) => {
			return token.actor && token.actor.id === actorID;
		});
		if (thisSceneToken) {
			token = getTokenObj(thisSceneToken.id);
		}
	}
	return token;
}

function getTokenObj(id) {
	if (!canvas.ready) {
		log.info(`getTokenObj(${id}) bailed - canvas is not ready yet`);
		return undefined;
	}
	return canvas.tokens.get(id);
}

let lastHoveredToken = null;
const hoverIn = (event, speaker) => {
	let token = getThisSceneTokenObj(speaker);
	if (token && token.isVisible) {
		event.fromChat = true;
		token._onHoverIn(event);
		lastHoveredToken = token;
	}
};

const hoverOut = (event) => {
	if (lastHoveredToken && lastHoveredToken._hover) {
		event.fromChat = true;
		lastHoveredToken._onHoverOut(event);
		lastHoveredToken = null;
	}
};

const panToSpeaker = (speaker) => {
	panToToken(getThisSceneTokenObj(speaker));
};

const panToToken = (token) => {
	if (token && token.isVisible) {
		const scale = Math.max(1, canvas.stage.scale.x);
		canvas.animatePan({ ...token.center, scale, duration: 1000 });
	}
}

const hasTokenOnSheet = (actor) => {
	return !!getThisSceneTokenObjForActor(actor.id);
}

const selectActorToken = (actor) => {
	let token = getThisSceneTokenObjForActor(actor.id);
	token.control();
	panToToken(token);
};

function updateMessageData(messageData, ...args) {
	return messageData.updateSource.apply(messageData, args);
}

// https://github.com/cs96and/FoundryVTT-CGMP/blob/c9ff185fb5dcdde67815039dc78a5de409a24956/module/scripts/chat-resolver.js#L122
function convertToOoc(messageData) {
	// For all types of messages, change the speaker to the GM.
	// Convert in-character message to out-of-character, and remove the actor and token.
	const newType = ((CONST.CHAT_MESSAGE_TYPES.IC === messageData.type) ? CONST.CHAT_MESSAGE_TYPES.OOC : messageData.type);
	const newActor = ((CONST.CHAT_MESSAGE_TYPES.IC === messageData.type) ? null : messageData.speaker.actor);
	const newToken = ((CONST.CHAT_MESSAGE_TYPES.IC === messageData.type) ? null : messageData.speaker.token);

	const user = (messageData.user instanceof User ? messageData.user : game.users.get(messageData.user));

	updateMessageData(messageData, {
		type: newType,
		speaker: {
			actor: newActor,
			alias: user.name,
			token: newToken
		}
	});
}

const CHAT_MESSAGE_SUB_TYPES = {
	NONE: 0,
	DESC: 1,
	AS: 2
};

function overrideMessage(messageData) {
	switch (messageData?.flags?.cgmp?.subType) {
		case CHAT_MESSAGE_SUB_TYPES.AS:
		case CHAT_MESSAGE_SUB_TYPES.DESC:
			break;

		default:
			convertToOoc(messageData, true);
			break;
	}
	if (mode() === 1) {
		$(`.${CSS_CURRENT_SPEAKER}--buttonInset`).attr("mode", 0)
		$(`.${CSS_CURRENT_SPEAKER}--buttonInset`).removeClass("fa-circle-1")
	}
}

function mode() { return Number($(`.${CSS_CURRENT_SPEAKER}--buttonInset`).attr("mode")) }

const CSS_CURRENT_SPEAKER = CSS_PREFIX + 'currentSpeaker';

// Create our div
const currentSpeakerDisplay = document.createElement('div');
currentSpeakerDisplay.classList.add(CSS_CURRENT_SPEAKER);

// Add images
let image = `<img class="${CSS_CURRENT_SPEAKER}--icon">`

// Add name
let text = `<span class="${CSS_CURRENT_SPEAKER}--text"></span>`

// Add buttons / indicators
let locked = `<i class="fa-solid fa-unlock ${CSS_CURRENT_SPEAKER}--locked"></i>`

// Once: <i class="fa-solid fa-circle-1"></i>
// Repeat: <i class="fa-solid fa-repeat"></i>
let oocButton = $($.parseHTML(`<i class="fa-solid fa-user ${CSS_CURRENT_SPEAKER}--button" data-tooltip=""><i class="${CSS_CURRENT_SPEAKER}--buttonInset fa-solid fa-inverse" mode="0"></i></i>`))
oocButton.click(function () {
	var classes = ["", "fa-circle-1", "fa-repeat"]
	$(`.${CSS_CURRENT_SPEAKER}--buttonInset`).attr("mode", mode() >= 2 ? 0 : mode() + 1)
	$(`.${CSS_CURRENT_SPEAKER}--buttonInset`).removeClass(classes.at(mode() - 1) ?? "").addClass(classes.at(mode()))

	switch (mode()) {
		case 1:
			Hooks.off('preCreateChatMessage', overrideMessage);
			Hooks.once('preCreateChatMessage', overrideMessage);
			updateSpeaker();
			break;
		case 2:
			Hooks.off('preCreateChatMessage', overrideMessage);
			Hooks.on('preCreateChatMessage', overrideMessage);
			updateSpeaker();
			break;
		case 0:
			Hooks.off('preCreateChatMessage', overrideMessage);
			updateSpeaker();
			break;
	}
})

$(currentSpeakerDisplay).append(image).append(text).append(locked).append(oocButton)

function updateSpeaker() {
	// Get the token speaker, if it doesn't exist it turns undefined.
	let tokenDocument = fromUuidSync(`Scene.${ChatMessage.getSpeaker().scene}.Token.${ChatMessage.getSpeaker().token}`)
	let name = ChatMessage.getSpeaker().alias
	let lockReason = false

	if (mode() !== 0) {
		lockReason = game.i18n.localize("speaking-as.self-locked")
		name = game.user.name
	}

	// Compatibility with Cautious Gamemaster's Pack
	// 1 - Disable Speaking as PC (GM ONLY, you can still speak as non-player owned tokens)
	// 2 - Force in Character (only ASSIGNED characters)
	// 3 - Force out of Character (always out of character)

	// If the module is active
	if (game.modules.get("CautiousGamemastersPack")?.active) {
		// If the user is a player and is forced to be always out of character (3)
		// If the user is a gamemaster and is forced to be always out of character (3)
		if ((game.user.isGM && game.settings.get("CautiousGamemastersPack", "gmSpeakerMode") === 3) || (!game.user.isGM && game.settings.get("CautiousGamemastersPack", "playerSpeakerMode") === 3)) {
			name = game.user.name
			lockReason = `${game.i18n.format("speaking-as.locked", { module: "Cautious Gamemaster's Pack" })}`
		}
		// If the user is a gamemaster and cannot speak as PC tokens (1)
		if (game.user.isGM && game.settings.get("CautiousGamemastersPack", "gmSpeakerMode") === 1 && tokenDocument?.actor?.hasPlayerOwner) {
			name = game.user.name
			lockReason = `${game.i18n.format("speaking-as.locked", { module: "Cautious Gamemaster's Pack" })}`
		}
		// If the user is a gamemaster and is forced to be always in character (2)
		if ((game.user.isGM && game.settings.get("CautiousGamemastersPack", "gmSpeakerMode") === 2) || (!game.user.isGM && game.settings.get("CautiousGamemastersPack", "playerSpeakerMode") === 2)) {
			tokenDocument = game.user.character.prototypeToken
			name = game.user.character.name
			lockReason = `${game.i18n.format("speaking-as.locked", { module: "Cautious Gamemaster's Pack" })}`
		}
	}

	// If a token is available and the user can speak as the character.
	if (tokenDocument && name !== game.user.name) {
		image = `<img src="${tokenDocument.texture.src}" class="${CSS_CURRENT_SPEAKER}--icon" style="transform: scale(${tokenDocument.texture.scaleX})">`
	} else {
		image = `<img src="${game.user.avatar}" class="${CSS_CURRENT_SPEAKER}--icon">`
	}
	text = `<span class="${CSS_CURRENT_SPEAKER}--text">${name}</span>`
	locked = $($.parseHTML(`<i class="fa-solid fa-unlock ${CSS_CURRENT_SPEAKER}--locked" data-tooltip="${game.i18n.localize("speaking-as.unlocked")}"></i>`))
	if (lockReason) {
		$(locked).attr("data-tooltip", lockReason)
		$(locked).removeClass("fa-unlock").addClass("fa-lock")
	}

	$(image).on("load", () => {
		if ($(`${CSS_CURRENT_SPEAKER}--icon`)[0] !== image) $(`.${CSS_CURRENT_SPEAKER}--icon`).replaceWith(image);
		if ($(`${CSS_CURRENT_SPEAKER}--text`)[0] !== text) $(`.${CSS_CURRENT_SPEAKER}--text`).replaceWith(text);
		if ($(`${CSS_CURRENT_SPEAKER}--locked`)[0] !== locked) $(`.${CSS_CURRENT_SPEAKER}--locked`).replaceWith(locked);
	})
}

Hooks.once('renderChatLog', () => {
	const chatControls = document.getElementById('chat-controls');
	// "be last" magic trick from Supe
	setTimeout(async () => {
		chatControls.parentNode.insertBefore(currentSpeakerDisplay, chatControls);
		// Apparently game.i18n.localize is not loaded when the button is added so it's here instead.
		$(`.${CSS_CURRENT_SPEAKER}--button`).attr("data-tooltip", game.i18n.localize("speaking-as.buttonHint"))
	}, 0);

	const currentSpeakerToggleMenu = new ContextMenu(
		$(chatControls.parentNode),
		'.' + CSS_CURRENT_SPEAKER,
		[]
	);
	const originalRender = currentSpeakerToggleMenu.render.bind(currentSpeakerToggleMenu);
	currentSpeakerToggleMenu.render = (...args) => {
		const actors = game.actors.contents.filter(
			(a) => a.isOwner && hasTokenOnSheet(a)
		);
		const speakerOptions = [];
		for (let actor of actors) {
			speakerOptions.push({
				name: actor.name,
				icon: "",
				callback: () => {
					selectActorToken(actor);
				},
			});
		}
		currentSpeakerToggleMenu.menuItems = speakerOptions;
		originalRender(...args);
	};

	setTimeout(async () => {
		updateSpeaker();
	}, 0);

	const csd = $(currentSpeakerDisplay);
	csd.hover((event) => {
		hoverIn(event, ChatMessage.getSpeaker());
	}, hoverOut);
	csd.dblclick((event) => panToSpeaker(ChatMessage.getSpeaker()));

	// Remove Illandril's Chat Enhancements display
	if (game.modules.get("illandril-chat-enhancements")?.active) document.getElementsByClassName('illandril-chat-enhancements--currentSpeaker')[0].remove();
});

Hooks.on('controlToken', updateSpeaker);
