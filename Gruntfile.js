module.exports = function (grunt) {
    grunt.initConfig({
        jshint: {
            all: ['src/**/*.js'],
            options: {
                globals: {
                    _: false,
                    $: false,
                    jasmine: false,
                    describe: false,
                    it: false,
                    fit: false,
                    expect: false,
                    beforeEach: false,
                    afterEach: false,
                    sinon: false
                },
                browser: true,
                devel: true
            }
        },
        testem: {
            unit: {
                options: {
                    framework: 'jasmine2',
                    launch_in_dev: ['Chrome'],
                    before_tests: 'grunt jshint',
                    serve_files: [
                        'node_modules/lodash/lodash.js',
                        'node_modules/jquery/dist/jquery.js',
                        'node_modules/sinon/pkg/sinon.js',
                        'src/**/*.js',
                        'test/**/*.js'
                    ],
                    watch_files: [
                        'src/**/*.js',
                        'test/**/*.js'
                    ]
                }
            }
        }
    });
    
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-testem');
    
    grunt.registerTask('default', ['testem:run:unit']);
    
};
