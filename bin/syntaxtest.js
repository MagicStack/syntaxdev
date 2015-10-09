#!/usr/bin/env node

'use strict';


var syntaxtest = require('../index'),
    argparse = require('argparse'),
    packageInfo = require('../package.json'),
    _ = require('underscore');


var cli = new argparse.ArgumentParser({
    prog:    packageInfo.name,
    version: packageInfo.version,
    addHelp: true
});


cli.addArgument([ '--tests' ], {
    help: 'Test files, ex: "--tests test/**/*.test"',
    nargs: '*',
    action: 'append',
    required: true
});


cli.addArgument([ '--no-color' ], {
    help: "Don't use colored output",
    action: 'storeTrue',
    default: false
});


cli.addArgument([ '--syntax' ], {
    help: 'Syntax file in YAML format, ex: "--syntax FooLang.YAML-tmLanguage"',
    required: true
});


function main() {
    var options = cli.parseArgs();
    syntaxtest(
        _.chain(options.tests).flatten().uniq().sort().value(),
        options.syntax,
        {
            no_color: options.no_color
        });
}


main();
