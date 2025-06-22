// extension.js - Main extension file
const vscode = require('vscode');

function activate(context) {
	// Register the command
	let disposable = vscode.commands.registerCommand(
		'htmlTagCommenter.commentTag',
		function () {
			const editor = vscode.window.activeTextEditor;

			if (!editor) {
				vscode.window.showErrorMessage('No active editor');
				return;
			}

			const document = editor.document;
			const position = editor.selection.active;

			// Find the HTML tag at cursor position
			const tagInfo = findTagAtPosition(document, position);``

			if (!tagInfo) {
				vscode.window.showErrorMessage('No HTML tag found at cursor position');
				return;
			}

			// Comment out the opening and closing tags
			commentOutTag(editor, tagInfo);
		}
	);

	context.subscriptions.push(disposable);
}

function findTagAtPosition(document, position) {
	const line = document.lineAt(position.line);
	const text = line.text;
	const cursorChar = position.character;

	// Find opening tag around cursor
	let openTagStart = -1;
	let openTagEnd = -1;

	// Look backwards for '<'
	for (let i = cursorChar; i >= 0; i--) {
		if (text[i] === '<' && (i === 0 || text[i - 1] !== '/')) {
			openTagStart = i;
			break;
		}
	}

	if (openTagStart === -1) return null;

	// Look forwards for '>'
	for (let i = openTagStart; i < text.length; i++) {
		if (text[i] === '>') {
			openTagEnd = i;
			break;
		}
	}

	if (openTagEnd === -1) return null;

	// Extract tag name
	const openTag = text.substring(openTagStart, openTagEnd + 1);
	const tagNameMatch = openTag.match(/<(\w+)/);

	if (!tagNameMatch) return null;

	const tagName = tagNameMatch[1];

	// Check if it's a self-closing tag
	if (openTag.includes('/>') || isSelfClosingTag(tagName)) {
		return {
			tagName,
			openTag: {
				line: position.line,
				startChar: openTagStart,
				endChar: openTagEnd + 1,
			},
			closeTag: null,
			isSelfClosing: true,
		};
	}

	// Find matching closing tag
	const closeTagInfo = findClosingTag(
		document,
		position.line,
		openTagEnd + 1,
		tagName
	);

	if (!closeTagInfo) {
		vscode.window.showErrorMessage(`Closing tag for <${tagName}> not found`);
		return null;
	}

	return {
		tagName,
		openTag: {
			line: position.line,
			startChar: openTagStart,
			endChar: openTagEnd + 1,
		},
		closeTag: closeTagInfo,
		isSelfClosing: false,
	};
}

function findClosingTag(document, startLine, startChar, tagName) {
	let depth = 1;
	let currentLine = startLine;
	let currentChar = startChar;

	while (currentLine < document.lineCount) {
		const line = document.lineAt(currentLine);
		const text = line.text;

		for (let i = currentChar; i < text.length; i++) {
			if (text[i] === '<') {
				// Check if it's an opening tag
				const remainingText = text.substring(i);
				const openMatch = remainingText.match(
					new RegExp(`^<${tagName}(?:\\s|>)`)
				);
				const closeMatch = remainingText.match(new RegExp(`^</${tagName}>`));

				if (openMatch && !remainingText.startsWith('</')) {
					depth++;
				} else if (closeMatch) {
					depth--;
					if (depth === 0) {
						// Found the matching closing tag
						const closeTagEnd = i + closeMatch[0].length;
						return {
							line: currentLine,
							startChar: i,
							endChar: closeTagEnd,
						};
					}
				}
			}
		}

		currentLine++;
		currentChar = 0; // Reset to beginning of next line
	}

	return null; // Closing tag not found
}

function commentOutTag(editor, tagInfo) {
	const document = editor.document;

	editor.edit((editBuilder) => {
		// Comment out opening tag
		const openLine = document.lineAt(tagInfo.openTag.line);
		const openTagText = openLine.text.substring(
			tagInfo.openTag.startChar,
			tagInfo.openTag.endChar
		);

		editBuilder.replace(
			new vscode.Range(
				tagInfo.openTag.line,
				tagInfo.openTag.startChar,
				tagInfo.openTag.line,
				tagInfo.openTag.endChar
			),
			`<!-- ${openTagText} -->`
		);

		// Comment out closing tag if it exists
		if (!tagInfo.isSelfClosing && tagInfo.closeTag) {
			const closeLine = document.lineAt(tagInfo.closeTag.line);
			const closeTagText = closeLine.text.substring(
				tagInfo.closeTag.startChar,
				tagInfo.closeTag.endChar
			);

			editBuilder.replace(
				new vscode.Range(
					tagInfo.closeTag.line,
					tagInfo.closeTag.startChar,
					tagInfo.closeTag.line,
					tagInfo.closeTag.endChar
				),
				`<!-- ${closeTagText} -->`
			);
		}
	});
}

function isSelfClosingTag(tagName) {
	const selfClosingTags = [
		'area',
		'base',
		'br',
		'col',
		'embed',
		'hr',
		'img',
		'input',
		'link',
		'meta',
		'param',
		'source',
		'track',
		'wbr',
	];
	return selfClosingTags.includes(tagName.toLowerCase());
}

function deactivate() {}

module.exports = {
	activate,
	deactivate,
};
