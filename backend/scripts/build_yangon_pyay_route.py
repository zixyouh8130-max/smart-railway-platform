import json
import math
import heapq
from pathlib import Path

import requests


# Try multiple public Overpass API servers.
OVERPASS_URLS = [
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]


OUTPUT_FILE = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "yangon_pyay.geojson"
)


# Approximate anchor points used only to identify
# the correct Yangon–Pyay railway corridor.
#
# Format:
# [longitude, latitude]
ROUTE_ANCHORS = {
    "Yangon Central": [96.16194, 16.78108],
    "Danyingon": [96.09387, 16.93281],
    "Letpadan": [95.74748, 17.78206],
    "Pyay": [95.21667, 18.82051],
}


# Bounding box covering Yangon -> Pyay.
#
# Overpass order:
# south, west, north, east
SOUTH = 16.74
WEST = 95.15
NORTH = 18.86
EAST = 96.20


def haversine(a, b):
    """
    Calculate distance between two coordinates in metres.

    Coordinates must be:
    [longitude, latitude]
    """

    lon1, lat1 = a
    lon2, lat2 = b

    earth_radius = 6371000

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad)
        * math.cos(lat2_rad)
        * math.sin(delta_lon / 2) ** 2
    )

    return (
        2
        * earth_radius
        * math.atan2(
            math.sqrt(value),
            math.sqrt(1 - value),
        )
    )


def download_railways():
    """
    Download railway=rail ways from OpenStreetMap
    using one of several Overpass API servers.
    """

    query = f"""
[out:json][timeout:180];

way
  ["railway"="rail"]
  ({SOUTH},{WEST},{NORTH},{EAST});

out geom;
"""

    print(
        "Downloading Yangon–Pyay railway geometry "
        "from OpenStreetMap..."
    )

    headers = {
        "User-Agent": (
            "SmartRailwayIntelligencePlatform/1.0 "
            "(Railway inspection research project)"
        ),
        "Accept": "application/json",
        "Content-Type": "text/plain; charset=utf-8",
    }

    errors = []

    for url in OVERPASS_URLS:
        print()
        print(f"Trying Overpass server: {url}")

        try:
            response = requests.post(
                url,
                data=query.encode("utf-8"),
                headers=headers,
                timeout=240,
            )

            print(
                f"HTTP status: "
                f"{response.status_code}"
            )

            if response.status_code != 200:
                response_preview = (
                    response.text[:500]
                    if response.text
                    else "No response body"
                )

                print(
                    "Server returned an error:"
                )
                print(response_preview)

                errors.append(
                    f"{url}: HTTP "
                    f"{response.status_code}"
                )

                continue

            try:
                data = response.json()

            except ValueError as exc:
                print(
                    "Server did not return valid JSON."
                )

                errors.append(
                    f"{url}: invalid JSON ({exc})"
                )

                continue

            ways = [
                element
                for element
                in data.get("elements", [])
                if (
                    element.get("type") == "way"
                    and element.get("geometry")
                )
            ]

            if not ways:
                print(
                    "The server responded successfully, "
                    "but no railway ways were returned."
                )

                errors.append(
                    f"{url}: no railway ways"
                )

                continue

            print(
                f"Downloaded {len(ways)} "
                f"railway ways."
            )

            print(
                f"Successful server: {url}"
            )

            return ways

        except requests.Timeout:
            print(
                "Request timed out."
            )

            errors.append(
                f"{url}: timeout"
            )

        except requests.ConnectionError as exc:
            print(
                f"Connection error: {exc}"
            )

            errors.append(
                f"{url}: connection error"
            )

        except requests.RequestException as exc:
            print(
                f"Request failed: {exc}"
            )

            errors.append(
                f"{url}: {exc}"
            )

    print()
    print("Overpass errors:")

    for error in errors:
        print(f" - {error}")

    raise RuntimeError(
        "Unable to download railway data from "
        "all configured Overpass API servers."
    )


def build_graph(ways):
    """
    Build an undirected railway graph.

    Each OpenStreetMap railway node becomes a graph node.
    """

    graph = {}
    coordinates = {}

    skipped_ways = 0

    for way in ways:
        node_ids = way.get("nodes", [])
        geometry = way.get("geometry", [])

        if not node_ids or not geometry:
            continue

        if len(node_ids) != len(geometry):
            skipped_ways += 1
            continue

        for node_id, location in zip(
            node_ids,
            geometry,
        ):
            coordinates[node_id] = [
                float(location["lon"]),
                float(location["lat"]),
            ]

            graph.setdefault(
                node_id,
                [],
            )

        for index in range(
            len(node_ids) - 1
        ):
            node_a = node_ids[index]
            node_b = node_ids[index + 1]

            coordinate_a = coordinates[node_a]
            coordinate_b = coordinates[node_b]

            distance = haversine(
                coordinate_a,
                coordinate_b,
            )

            graph[node_a].append(
                (node_b, distance)
            )

            graph[node_b].append(
                (node_a, distance)
            )

    if skipped_ways:
        print(
            f"Skipped {skipped_ways} "
            f"incomplete railway ways."
        )

    return graph, coordinates


def nearest_node(
    target,
    coordinates,
    allowed_nodes=None,
):
    """
    Find the railway node nearest to a coordinate.
    """

    best_node = None
    best_distance = float("inf")

    if allowed_nodes is None:
        nodes = coordinates.keys()
    else:
        nodes = allowed_nodes

    for node_id in nodes:
        coordinate = coordinates.get(node_id)

        if coordinate is None:
            continue

        distance = haversine(
            target,
            coordinate,
        )

        if distance < best_distance:
            best_distance = distance
            best_node = node_id

    return best_node, best_distance


def connected_components(graph):
    """
    Return all connected railway graph components.
    """

    seen = set()
    components = []

    for start_node in graph:
        if start_node in seen:
            continue

        stack = [start_node]
        component = set()

        while stack:
            node = stack.pop()

            if node in seen:
                continue

            seen.add(node)
            component.add(node)

            for neighbour, _ in graph.get(
                node,
                [],
            ):
                if neighbour not in seen:
                    stack.append(neighbour)

        components.append(component)

    return components


def choose_route_component(
    graph,
    coordinates,
):
    """
    Select the connected railway component
    that best matches Yangon -> Pyay.
    """

    components = connected_components(
        graph
    )

    print(
        f"Connected railway components: "
        f"{len(components)}"
    )

    best_component = None
    best_score = float("inf")

    for component in components:
        # Ignore tiny siding tracks and fragments.
        if len(component) < 50:
            continue

        score = 0
        valid = True

        for anchor_name, anchor_coordinate in (
            ROUTE_ANCHORS.items()
        ):
            _, distance = nearest_node(
                anchor_coordinate,
                coordinates,
                component,
            )

            # If a connected component is more than
            # 10 km from any important anchor,
            # it is probably not the Yangon-Pyay route.
            if distance > 10000:
                valid = False
                break

            score += distance

        if valid and score < best_score:
            best_score = score
            best_component = component

    if best_component is None:
        raise RuntimeError(
            "Could not identify a connected railway "
            "component matching Yangon–Pyay."
        )

    return best_component


def shortest_path(
    graph,
    start,
    end,
    allowed_nodes,
):
    """
    Dijkstra shortest path through the railway graph.
    """

    distances = {
        start: 0.0
    }

    previous = {}

    queue = [
        (0.0, start)
    ]

    while queue:
        current_distance, current = (
            heapq.heappop(queue)
        )

        if current == end:
            break

        if (
            current_distance
            != distances.get(current)
        ):
            continue

        for neighbour, weight in graph.get(
            current,
            [],
        ):
            if neighbour not in allowed_nodes:
                continue

            new_distance = (
                current_distance + weight
            )

            if new_distance < distances.get(
                neighbour,
                float("inf"),
            ):
                distances[neighbour] = (
                    new_distance
                )

                previous[neighbour] = current

                heapq.heappush(
                    queue,
                    (
                        new_distance,
                        neighbour,
                    ),
                )

    if end not in distances:
        raise RuntimeError(
            "No railway path was found between "
            f"nodes {start} and {end}."
        )

    path = []
    node = end

    while node != start:
        path.append(node)

        if node not in previous:
            raise RuntimeError(
                "Railway path reconstruction "
                "failed."
            )

        node = previous[node]

    path.append(start)

    path.reverse()

    return path


def remove_duplicate_coordinates(
    coordinates,
):
    """
    Remove consecutive duplicate coordinates.
    """

    if not coordinates:
        return []

    result = [
        coordinates[0]
    ]

    for coordinate in coordinates[1:]:
        if coordinate != result[-1]:
            result.append(coordinate)

    return result


def calculate_route_length(
    coordinates,
):
    """
    Calculate total LineString length in metres.
    """

    total = 0.0

    for index in range(
        len(coordinates) - 1
    ):
        total += haversine(
            coordinates[index],
            coordinates[index + 1],
        )

    return total


def build_yangon_pyay_route():
    ways = download_railways()

    print()
    print(
        "Building railway graph..."
    )

    graph, coordinates = build_graph(
        ways
    )

    print(
        f"Railway nodes: "
        f"{len(coordinates)}"
    )

    print(
        f"Graph nodes: "
        f"{len(graph)}"
    )

    if not graph:
        raise RuntimeError(
            "Railway graph is empty."
        )

    print()
    print(
        "Finding Yangon–Pyay "
        "railway component..."
    )

    route_component = (
        choose_route_component(
            graph,
            coordinates,
        )
    )

    print(
        "Using connected railway "
        f"component with "
        f"{len(route_component)} nodes."
    )

    print()
    print(
        "Matching route anchors "
        "to railway..."
    )

    anchor_nodes = []

    for (
        anchor_name,
        anchor_coordinate,
    ) in ROUTE_ANCHORS.items():

        node_id, distance = nearest_node(
            anchor_coordinate,
            coordinates,
            route_component,
        )

        if node_id is None:
            raise RuntimeError(
                "Could not locate railway "
                f"near {anchor_name}."
            )

        print(
            f"{anchor_name}: nearest "
            f"railway node is "
            f"{distance:.1f} m away"
        )

        anchor_nodes.append(
            (
                anchor_name,
                node_id,
            )
        )

    print()
    print(
        "Calculating Yangon–Pyay "
        "railway path..."
    )

    complete_path = []

    for index in range(
        len(anchor_nodes) - 1
    ):
        start_name, start_node = (
            anchor_nodes[index]
        )

        end_name, end_node = (
            anchor_nodes[index + 1]
        )

        print(
            f"Finding railway path: "
            f"{start_name} -> {end_name}"
        )

        section = shortest_path(
            graph,
            start_node,
            end_node,
            route_component,
        )

        print(
            f"  Section nodes: "
            f"{len(section)}"
        )

        if complete_path:
            # Avoid duplicating the junction node.
            section = section[1:]

        complete_path.extend(
            section
        )

    route_coordinates = [
        coordinates[node_id]
        for node_id in complete_path
    ]

    route_coordinates = (
        remove_duplicate_coordinates(
            route_coordinates
        )
    )

    if len(route_coordinates) < 2:
        raise RuntimeError(
            "Generated railway route "
            "contains fewer than two "
            "coordinates."
        )

    route_length = (
        calculate_route_length(
            route_coordinates
        )
    )

    route_length_km = (
        route_length / 1000
    )

    geojson = {
        "type": "Feature",
        "properties": {
            "name": (
                "Yangon–Pyay Railway"
            ),
            "name_my": (
                "ရန်ကုန်–ပြည် မီးရထားလမ်း"
            ),
            "route_code": (
                "YANGON-PYAY"
            ),
            "source": (
                "OpenStreetMap"
            ),
            "attribution": (
                "© OpenStreetMap contributors"
            ),
            "length_km": round(
                route_length_km,
                2,
            ),
            "coordinate_count": len(
                route_coordinates
            ),
        },
        "geometry": {
            "type": "LineString",
            "coordinates": (
                route_coordinates
            ),
        },
    }

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            geojson,
            file,
            ensure_ascii=False,
            indent=2,
        )

    print()
    print(
        "=" * 60
    )

    print(
        "Yangon–Pyay railway route "
        "created successfully."
    )

    print(
        f"Coordinates: "
        f"{len(route_coordinates)}"
    )

    print(
        f"Calculated length: "
        f"{route_length_km:.2f} km"
    )

    print(
        f"Saved to:"
    )

    print(
        OUTPUT_FILE
    )

    print(
        "=" * 60
    )


if __name__ == "__main__":
    try:
        build_yangon_pyay_route()

    except KeyboardInterrupt:
        print()
        print(
            "Operation cancelled "
            "by user."
        )

    except Exception as exc:
        print()
        print(
            "=" * 60
        )

        print(
            "FAILED TO CREATE "
            "YANGON–PYAY ROUTE"
        )

        print(
            "=" * 60
        )

        print(
            f"{type(exc).__name__}: "
            f"{exc}"
        )

        raise