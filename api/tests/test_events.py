import asyncio
from app.events import Broadcaster


def test_publish_reaches_subscriber():
    async def go():
        b = Broadcaster()
        it = b.subscribe()
        task = asyncio.create_task(it.__anext__())
        await asyncio.sleep(0)
        await b.publish("lift_changed", {"exitId": "south"})
        return await asyncio.wait_for(task, 1)
    assert asyncio.run(go()) == {"event": "lift_changed", "data": {"exitId": "south"}}


def test_full_queue_drops_instead_of_blocking():
    async def go():
        b = Broadcaster()
        it = b.subscribe()
        task = asyncio.create_task(it.__anext__())
        await asyncio.sleep(0)
        for i in range(250):
            await b.publish("x", {"i": i})
        return await asyncio.wait_for(task, 1)
    assert asyncio.run(go())["data"] == {"i": 0}
