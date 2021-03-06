/* jshint globalstrict: true */

'use strict';

var ESCAPES = {'n':'\n', 'f':'\f', 'r':'\r', 't':'\t', 'v':'\v', '\'': '\'', '"': '"'};

function parse(expr) {
    var lexer, parser;
    
    lexer = new Lexer();
    parser = new Parser(lexer);
    
    return parser.parse(expr);
}

function Lexer() {

}

Lexer.prototype.lex = function(text) {
    this.text = text;
    this.index = 0;
    this.ch = undefined;
    this.tokens = [];
    
    while (this.index < this.text.length) {
        this.ch = this.text.charAt(this.index);
        
        if(this.isNumber(this.ch) || (this.is('.') && this.isNumber(this.peek()))) {
            this.readNumber();
        } else if(this.is('\'"')) {
            this.readString(this.ch);
        } else if(  this.is('[],{}:.()')) {
            this.tokens.push({
                text: this.ch
            });
            this.index++;
        } else if(this.isIdent(this.ch)) {
            this.readIdent();
        }  else if(this.isWhitespace(this.ch)) {
            this.index++;
        } else {
            throw 'Unexpected next character: ' + this.ch;
        }
    }
    
    return this.tokens;
};

Lexer.prototype.is = function (chs) {
    return chs.indexOf(this.ch) >= 0;
};

Lexer.prototype.isNumber = function(ch) {
    return '0' <= ch && ch <= '9';
};

Lexer.prototype.readNumber = function() {
    var ch, nextCh, prevCh, number = '';
    
    while (this.index < this.text.length) {
        ch = this.text.charAt(this.index).toLowerCase();
        if(ch === '.' || this.isNumber(ch)) {
            number += ch;
        } else {
            nextCh = this.peek();
            prevCh = number.charAt(number.length - 1);
            if(ch === 'e' && this.isExpOperator(nextCh)) {
                number += ch;
            } else if (this.isExpOperator(ch) && prevCh === 'e' && nextCh && this.isNumber(nextCh)) {
                number += ch;
            } else if (this.isExpOperator(ch) && prevCh === 'e' && (!nextCh || !this.isNumber(nextCh))) {
                throw 'Invalid exponent';
            } else {
                break;
            }
        }
        this.index++;
    }
    
    this.tokens.push({
        text: number,
        value: Number(number)
    });
};

Lexer.prototype.readString = function(quote) {
    var replacement, ch, hex, string = '', escape = false;
    
    this.index++;
    
    while (this.index < this.text.length) {
        ch = this.text.charAt(this.index);
        
        if (escape) {
            if (ch === 'u') {
                hex = this.text.substring(this.index + 1, this.index + 5);
                if (!hex.match(/[\da-f]{4}/i)) {
                    throw 'Invalid unicode escape';
                }
                this.index += 4;
                string += String.fromCharCode(parseInt(hex, 16));
            } else {
                replacement = ESCAPES[ch];
                if (replacement) {
                    string += replacement;
                } else {
                    string += ch;
                }
            }
            escape = false;
        } else if (ch === quote) {
            this.index++;
            this.tokens.push({
                text: string,
                value: string
            });
            return;
        } else if (ch === '\\') {
            escape = true;
        } else {
            string += ch;
        }
        
        this.index++;
    }
    
    throw 'Unmatched quote';
};

Lexer.prototype.readIdent = function() {
    var text = '', token, ch;
    
    while (this.index < this.text.length) {
        ch = this.text.charAt(this.index);
        if(this.isIdent(ch) || this.isNumber(ch)) {
            text += ch;
        } else {
            break;
        }
        this.index++;
    }
    
    token = {
        text: text,
        identifier: true
    };
    
    this.tokens.push(token);
};

Lexer.prototype.peek = function() {
    return this.index < this.text.length - 1 ?
        this.text.charAt(this.index + 1) :
        false;
};

Lexer.prototype.isExpOperator = function(ch) {
    return ch === '-' || ch === '+' || this.isNumber(ch);
};

Lexer.prototype.isIdent = function(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
};

Lexer.prototype.isWhitespace = function(ch) {
    return  ch === ' ' || ch === '\r' || ch === '\t' ||
            ch === '\n' || ch === '\v' || ch === '\u00A0';
};

function AST(lexer) {
    this.lexer = lexer;
}

AST.Program = 'Program';
AST.Literal = 'Literal';
AST.ArrayExpression = 'ArrayExpression';
AST.ObjectExpression = 'ObjectExpression';
AST.Property = 'Property';
AST.Identifier = 'Identifier';
AST.ThisExpression = 'ThisExpression';
AST.MemberExpression = 'MemberExpression';
AST.CallExpression = 'CallExpression';

AST.prototype.constants = {
    'null': {type: AST.Literal, value: null},
    'true': {type: AST.Literal, value: true},
    'false': {type: AST.Literal, value: false},
    'this': {type: AST.ThisExpression}
};

AST.prototype.ast = function(text) {
    this.tokens = this.lexer.lex(text);
    return this.program();
};

AST.prototype.program = function() {
    return {type: AST.Program, body: this.primary()};
};

AST.prototype.primary = function() {
    var primary, next;
    
    if (this.expect('[')) {
        primary = this.arrayDeclaration();
    } else if (this.expect('{')) {
        primary =  this.object();
    } else if (this.constants.hasOwnProperty(this.tokens[0].text)) {
        primary = this.constants[this.consume().text];
    } else if (this.peek().identifier) {
        primary = this.identifier();
    } else {
        primary = this.constant();
    }

    while ((next = this.expect('.', '[', '('))) {
        if(next.text === '[') {
            primary = {
                type: AST.MemberExpression,
                object: primary,
                property: this.primary(),
                computed: true
            };
            this.consume(']');
        } else if(next.text === '.') {
            primary = {
                type: AST.MemberExpression,
                object: primary,
                property: this.identifier(),
                computed: false
            };
        } else if(next.text === '(') {
            primary = {
                type: AST.CallExpression,
                callee: primary,
                arguments: this.parseArguments()
            };
            this.consume(')');
        }
    }
    
    return primary;
};

AST.prototype.constant = function() {
    return {type: AST.Literal, value: this.consume().value};
};

AST.prototype.identifier = function() {
    return {type: AST.Identifier, name: this.consume().text};
};

AST.prototype.expect = function(e1, e2, e3, e4) {
    var token = this.peek(e1, e2, e3, e4);
    if(token) {
        return this.tokens.shift();
    }
};

AST.prototype.consume = function(e) {
    var token = this.expect(e);
    
    if(!token) {
        throw 'Unexpected. Expecting: ' + e;
    }
    
    return token;
};

AST.prototype.parseArguments = function() {
    var args = [];
    
    if(!this.peek(')')) {
        do {
            args.push(this.primary());
        } while(this.expect(','));
    }
    
    return args;
};

AST.prototype.arrayDeclaration = function() {
    var elements = [];
    
    if(!this.peek(']')) {
        do {
            if (this.peek(']')) {
                break;
            }
            elements.push(this.primary());
        } while (this.expect(','));
    }
    
    this.consume(']');
    return {type: AST.ArrayExpression, elements: elements};
};

AST.prototype.object = function() {
    var property, properties = [];
    
    if(!this.peek('}')) {
        do {
            property = {type: AST.Property};
            if(this.peek().identifier) {
                property.key = this.identifier();
            } else {
                property.key = this.constant();
            }
            this.consume(':');
            property.value = this.primary();
            properties.push(property);
        } while (this.expect(','));
    }
    
    this.consume('}');
    
    return {type: AST.ObjectExpression, properties: properties};
};

AST.prototype.peek = function(e1, e2, e3, e4) {
    var text;
    
    if (this.tokens.length > 0) {
        text = this.tokens[0].text;
        if(text === e1 || text === e2 || text === e3 || text === e4 ||
                (!e1 && !e2 && !e3 && !e4)) {
            return this.tokens[0];
        }
    }
};

function ASTCompiler(astBuilder) {
    this.astBuilder = astBuilder;
}

ASTCompiler.prototype.compile = function(text) {
    var ast = this.astBuilder.ast(text);
    
    this.state = {body: [], nextId: 0, vars: []};
    this.recurse(ast);
    
    /* jshint -W054 */
    return new Function('s', 'l', 
        (this.state.vars.length ?
            'var ' + this.state.vars.join(',') + ';' :
            ''
        ) + this.state.body.join(''));
    /* jshint +W054 */
};

ASTCompiler.prototype.recurse = function(ast, context) {
    var intoId, left, right, callee, callContext, args, elements, self = this;
    
    switch(ast.type) {
        case AST.Program:
            this.state.body.push('return ', this.recurse(ast.body), ';');
            break;
        case AST.Literal:
            return this.escape(ast.value);
        case AST.ArrayExpression:
            elements = _.map(ast.elements, function(element) {
                return self.recurse(element);
            });
            return '[' + elements.join(',') + ']';
        case AST.ObjectExpression:
            var properties = _.map(ast.properties, function(property) {
                var key = property.key.type === AST.Identifier ?
                    property.key.name :
                    self.escape(property.key.value),
                    value = self.recurse(property.value);
                    return key + ':' + value;
            });
            return '{' + properties.join(',') + '}';
        case AST.Identifier:
            intoId = this.nextId();
            this.if_(this.getHasOwnProperty('l', ast.name), this.assign(intoId, this.nonComputedMember('l', ast.name)));
            this.if_(this.not(this.getHasOwnProperty('l', ast.name)) + ' && s', this.assign(intoId, this.nonComputedMember('s', ast.name)));
            if(context) {
                context.context = this.getHasOwnProperty('l', ast.name) + '?l:s';
                context.name = ast.name;
                context.computed = false;
            }
            return intoId;
        case AST.ThisExpression:
            return 's';
        case AST.MemberExpression:
            intoId = this.nextId();
            left = this.recurse(ast.object);
            if(context) {
                context.context = left;
            }
            if(ast.computed) {
                right = this.recurse(ast.property);
                this.if_(left, this.assign(intoId, this.computedMember(left, right)));
                if(context) {
                    context.name = right;
                    context.computed = true;
                }
            } else {
                this.if_(left, this.assign(intoId, this.nonComputedMember(left, ast.property.name)));
                if(context) {
                    context.name = ast.property.name;
                    context.computed = false;
                }
            }
            return intoId;
        case AST.CallExpression:
            callContext = {};
            callee = this.recurse(ast.callee, callContext);
            args = _.map(ast.arguments, function(arg) {
                return self.recurse(arg);
            });
            if(callContext.name) {
                if(callContext.computed) {
                    callee = this.computedMember(callContext.context, callContext.name);
                } else {
                    callee = this.nonComputedMember(callContext.context, callContext.name);
                }
            }
            return callee + '&&' + callee + '(' + args.join(',') + ')';
    }
};

ASTCompiler.prototype.getHasOwnProperty = function(object, property) {
    return object + '&&(' + this.escape(property) + ' in ' + object + ')';
};

ASTCompiler.prototype.not = function(e) {
    return '!(' + e + ')';
};

ASTCompiler.prototype.nextId = function() {
    var id = 'v' + this.state.nextId++;
    this.state.vars.push(id);
    return id;
};

ASTCompiler.prototype.assign = function(id, value) {
    return id + '=' + value + ';';
};

ASTCompiler.prototype.nonComputedMember = function(left, right) {
    return '(' + left + ').' + right;
};

ASTCompiler.prototype.computedMember = function(left, right) {
    return '(' + left + ')[' + right + ']';
};

ASTCompiler.prototype.escape = function(value) {
    if(_.isString(value)) {
        return '\'' +
                value.replace(this.stringEscapeRegex, this.stringEscapeFn) +
            '\'';
    } else if(_.isNull(value)) {
        return 'null';
    } else {
        return value;
    }
};

ASTCompiler.prototype.stringEscapeRegex = /[^ a-zA-Z0-9]/g;

ASTCompiler.prototype.stringEscapeFn = function(c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
};

ASTCompiler.prototype.if_ = function(test, consequent) {
    this.state.body.push('if(' + test + '){' + consequent + '}');
};

function Parser(lexer) {
    this.lexer = lexer;
    this.ast = new AST(this.lexer);
    this.astCompiler = new ASTCompiler(this.ast);
}

Parser.prototype.parse = function(text) {
    return this.astCompiler.compile(text);
};