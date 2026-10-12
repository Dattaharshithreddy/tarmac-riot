import sys, runpy
script = sys.argv[1]
sys.argv = [script] + ['--'] + sys.argv[2:]
runpy.run_path(script, run_name='__main__')
