// extension.js - Main extension file with keybinding management
const vscode = require('vscode');

function activate(context) {
    // Check for keybinding conflicts on startup if enabled
    const config = vscode.workspace.getConfiguration('tagToggle');
    if (config.get('checkConflictsOnStartup', true)) {
        setTimeout(() => checkKeybindingConflicts(), 2000); // Delay to ensure VS Code is fully loaded
    }

    // Register the main toggle command
    let toggleDisposable = vscode.commands.registerCommand('tagToggle.toggleCommentTag', function () {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        const document = editor.document;
        const position = editor.selection.active;
        
        // Check if we're in a commented tag first
        const commentedTagInfo = findCommentedTagAtPosition(document, position);
        
        if (commentedTagInfo) {
            // Uncomment the tag
            uncommentTag(editor, commentedTagInfo);
            return;
        }
        
        // Find the HTML tag at cursor position
        const tagInfo = findTagAtPosition(document, position);
        
        if (!tagInfo) {
            vscode.window.showErrorMessage('No HTML tag found at cursor position');
            return;
        }

        // Comment out the opening and closing tags
        commentOutTag(editor, tagInfo);
    });

    // Register the set keybinding command
    let setKeybindingDisposable = vscode.commands.registerCommand('tagToggle.setKeybinding', async function () {
        await setCustomKeybinding();
    });

    // Register the check conflicts command
    let checkConflictsDisposable = vscode.commands.registerCommand('tagToggle.checkKeybindingConflict', async function () {
        await checkKeybindingConflicts();
    });

    context.subscriptions.push(toggleDisposable, setKeybindingDisposable, checkConflictsDisposable);
}

async function setCustomKeybinding() {
    const currentKeybinding = vscode.workspace.getConfiguration('tagToggle').get('keybinding', 'cmd+shift+/');
    
    const newKeybinding = await vscode.window.showInputBox({
        prompt: 'Enter your preferred keybinding (e.g., cmd+shift+/, ctrl+alt+t)',
        value: currentKeybinding,
        placeHolder: 'cmd+shift+/',
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'Keybinding cannot be empty';
            }
            
            // Basic validation for keybinding format
            const validPattern = /^(ctrl|cmd|alt|shift)(\+(ctrl|cmd|alt|shift))*\+[a-zA-Z0-9\/\\\[\];',\.`\-=]$/;
            if (!validPattern.test(value.trim())) {
                return 'Invalid keybinding format. Use modifiers like cmd, ctrl, alt, shift followed by a key (e.g., cmd+shift+/)';
            }
            
            return null;
        }
    });

    if (newKeybinding) {
        try {
            // Update the configuration
            await vscode.workspace.getConfiguration('tagToggle').update('keybinding', newKeybinding.trim(), vscode.ConfigurationTarget.Global);
            
            // Check for conflicts with the new keybinding
            const conflicts = await findKeybindingConflicts(newKeybinding.trim());
            
            if (conflicts.length > 0) {
                const conflictList = conflicts.map(c => `• ${c.command} (${c.source})`).join('\n');
                const choice = await vscode.window.showWarningMessage(
                    `The keybinding "${newKeybinding}" conflicts with:\n${conflictList}\n\nDo you want to keep this keybinding anyway?`,
                    'Keep Anyway',
                    'Choose Different'
                );
                
                if (choice === 'Choose Different') {
                    return setCustomKeybinding(); // Recursively call to choose again
                }
            }

            vscode.window.showInformationMessage(
                `Keybinding updated to: ${newKeybinding}\n\nNote: You may need to reload VS Code or manually add this keybinding to your keybindings.json file for it to take effect.`
            );

            // Offer to open keybindings.json
            const openKeybindings = await vscode.window.showInformationMessage(
                'Would you like to open the keybindings.json file to manually add the keybinding?',
                'Open Keybindings',
                'Not Now'
            );

            if (openKeybindings === 'Open Keybindings') {
                vscode.commands.executeCommand('workbench.action.openGlobalKeybindings');
            }

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to update keybinding: ${error.message}`);
        }
    }
}

async function checkKeybindingConflicts() {
    const config = vscode.workspace.getConfiguration('tagToggle');
    const currentKeybinding = config.get('keybinding', 'cmd+shift+/');
    
    const conflicts = await findKeybindingConflicts(currentKeybinding);
    
    if (conflicts.length === 0) {
        vscode.window.showInformationMessage(`No conflicts found for keybinding: ${currentKeybinding}`);
        return;
    }

    const conflictList = conflicts.map(c => `• ${c.command} (${c.source})`).join('\n');
    const choice = await vscode.window.showWarningMessage(
        `Keybinding "${currentKeybinding}" conflicts with:\n${conflictList}`,
        'Change Keybinding',
        'Ignore',
        'Open Keybindings Settings'
    );

    switch (choice) {
        case 'Change Keybinding':
            await setCustomKeybinding();
            break;
        case 'Open Keybindings Settings':
            vscode.commands.executeCommand('workbench.action.openGlobalKeybindings');
            break;
    }
}

async function findKeybindingConflicts(keybinding) {
    try {
        // Get all current keybindings
        const allKeybindings = await vscode.commands.executeCommand('vscode.getKeybindings');
        
        // Normalize the keybinding for comparison
        const normalizedKeybinding = normalizeKeybinding(keybinding);
        
        const conflicts = [];
        
        for (const kb of allKeybindings) {
            if (kb.keybinding && normalizeKeybinding(kb.keybinding) === normalizedKeybinding) {
                // Skip our own command
                if (kb.command === 'tagToggle.toggleCommentTag') {
                    continue;
                }
                
                conflicts.push({
                    command: kb.command,
                    source: kb.source || 'Built-in',
                    when: kb.when
                });
            }
        }
        
        return conflicts;
    } catch (error) {
        console.error('Error checking keybinding conflicts:', error);
        return [];
    }
}

function normalizeKeybinding(keybinding) {
    if (!keybinding) return '';
    
    // Convert to lowercase and normalize modifier order
    const parts = keybinding.toLowerCase().split('+');
    const modifiers = [];
    let key = '';
    
    for (const part of parts) {
        if (['ctrl', 'cmd', 'alt', 'shift', 'meta'].includes(part)) {
            modifiers.push(part);
        } else {
            key = part;
        }
    }
    
    // Sort modifiers for consistent comparison
    modifiers.sort();
    
    return modifiers.length > 0 ? modifiers.join('+') + '+' + key : key;
}

// Original functions remain the same
function findTagAtPosition(document, position) {
    const line = document.lineAt(position.line);
    const text = line.text;
    const cursorChar = position.character;
    
    // Find opening tag around cursor
    let openTagStart = -1;
    let openTagEnd = -1;
    
    // Look backwards for '<'
    for (let i = cursorChar; i >= 0; i--) {
        if (text[i] === '<' && (i === 0 || text[i-1] !== '/')) {
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
                endChar: openTagEnd + 1
            },
            closeTag: null,
            isSelfClosing: true
        };
    }
    
    // Find matching closing tag
    const closeTagInfo = findClosingTag(document, position.line, openTagEnd + 1, tagName);
    
    if (!closeTagInfo) {
        vscode.window.showErrorMessage(`Closing tag for <${tagName}> not found`);
        return null;
    }
    
    return {
        tagName,
        openTag: {
            line: position.line,
            startChar: openTagStart,
            endChar: openTagEnd + 1
        },
        closeTag: closeTagInfo,
        isSelfClosing: false
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
                const openMatch = remainingText.match(new RegExp(`^<${tagName}(?:\\s|>)`));
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
                            endChar: closeTagEnd
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
    
    editor.edit(editBuilder => {
        // Comment out opening tag
        const openLine = document.lineAt(tagInfo.openTag.line);
        const openTagText = openLine.text.substring(tagInfo.openTag.startChar, tagInfo.openTag.endChar);
        
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
            const closeTagText = closeLine.text.substring(tagInfo.closeTag.startChar, tagInfo.closeTag.endChar);
            
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

function findCommentedTagAtPosition(document, position) {
    const line = document.lineAt(position.line);
    const text = line.text;
    const cursorChar = position.character;
    
    // Look for <!-- around cursor position
    let commentStart = -1;
    let commentEnd = -1;
    
    // Find comment start
    for (let i = cursorChar; i >= 0; i--) {
        if (text.substring(i, i + 4) === '<!--') {
            commentStart = i;
            break;
        }
    }
    
    if (commentStart === -1) return null;
    
    // Find comment end on same line
    for (let i = commentStart + 4; i < text.length - 2; i++) {
        if (text.substring(i, i + 3) === '-->') {
            commentEnd = i + 3;
            break;
        }
    }
    
    if (commentEnd === -1) return null;
    
    // Extract the tag from the comment
    const commentContent = text.substring(commentStart + 4, commentEnd - 3).trim();
    
    // Check if it's an HTML tag
    const tagMatch = commentContent.match(/^<(\w+)/);
    if (!tagMatch) return null;
    
    const tagName = tagMatch[1];
    
    // Check if it's a self-closing tag
    if (commentContent.includes('/>') || isSelfClosingTag(tagName)) {
        return {
            tagName,
            openComment: {
                line: position.line,
                startChar: commentStart,
                endChar: commentEnd,
                content: commentContent
            },
            closeComment: null,
            isSelfClosing: true
        };
    }
    
    // Find matching closing comment
    const closeCommentInfo = findClosingComment(document, position.line, commentEnd, tagName);
    
    if (!closeCommentInfo) {
        vscode.window.showErrorMessage(`Closing comment for <${tagName}> not found`);
        return null;
    }
    
    return {
        tagName,
        openComment: {
            line: position.line,
            startChar: commentStart,
            endChar: commentEnd,
            content: commentContent
        },
        closeComment: closeCommentInfo,
        isSelfClosing: false
    };
}

function findClosingComment(document, startLine, startChar, tagName) {
    let currentLine = startLine;
    let currentChar = startChar;
    
    while (currentLine < document.lineCount) {
        const line = document.lineAt(currentLine);
        const text = line.text;
        
        for (let i = currentChar; i < text.length - 6; i++) {
            if (text.substring(i, i + 4) === '<!--') {
                // Find the end of this comment
                let commentEnd = -1;
                for (let j = i + 4; j < text.length - 2; j++) {
                    if (text.substring(j, j + 3) === '-->') {
                        commentEnd = j + 3;
                        break;
                    }
                }
                
                if (commentEnd !== -1) {
                    const commentContent = text.substring(i + 4, commentEnd - 3).trim();
                    
                    // Check if this is our closing tag
                    if (commentContent === `</${tagName}>`) {
                        return {
                            line: currentLine,
                            startChar: i,
                            endChar: commentEnd,
                            content: commentContent
                        };
                    }
                }
            }
        }
        
        currentLine++;
        currentChar = 0;
    }
    
    return null;
}

function uncommentTag(editor, commentedTagInfo) {
    editor.edit(editBuilder => {
        // Uncomment opening tag
        editBuilder.replace(
            new vscode.Range(
                commentedTagInfo.openComment.line,
                commentedTagInfo.openComment.startChar,
                commentedTagInfo.openComment.line,
                commentedTagInfo.openComment.endChar
            ),
            commentedTagInfo.openComment.content
        );
        
        // Uncomment closing tag if it exists
        if (!commentedTagInfo.isSelfClosing && commentedTagInfo.closeComment) {
            editBuilder.replace(
                new vscode.Range(
                    commentedTagInfo.closeComment.line,
                    commentedTagInfo.closeComment.startChar,
                    commentedTagInfo.closeComment.line,
                    commentedTagInfo.closeComment.endChar
                ),
                commentedTagInfo.closeComment.content
            );
        }
    });
}

function isSelfClosingTag(tagName) {
    const selfClosingTags = [
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
        'link', 'meta', 'param', 'source', 'track', 'wbr'
    ];
    return selfClosingTags.includes(tagName.toLowerCase());
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};