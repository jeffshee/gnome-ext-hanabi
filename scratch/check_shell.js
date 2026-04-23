const { Shell, Meta } = imports.gi;
const Main = imports.ui.main;

function check() {
    let actors = global.get_window_actors();
    log(`Total window actors: ${actors.length}`);
    for (let a of actors) {
        if (a.meta_window) {
            log(`Window: ${a.meta_window.title} (monitor: ${a.meta_window.get_monitor()})`);
        }
    }
    
    let laters = global.compositor.get_laters();
    log(`Laters object: ${laters}`);
}

check();
